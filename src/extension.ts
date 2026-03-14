'use strict';

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            {scheme: "file", language: "poke"}, 
            new PokeDocumentSymbolProvider()
        )
    );
}

class PokeDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    private lineno = 0
    private pos = 0
    private token = ""
    private comment = false
    private str = false
    private line: vscode.TextLine | undefined
    private document: vscode.TextDocument | undefined

    private nextToken(): string {
        if(this.document){
            while(this.lineno < this.document.lineCount){
                this.line = this.document.lineAt(this.lineno);
                while(this.pos < this.line.text.length){
                    const c = this.line.text[this.pos++]
                    if(this.comment){
                        if(c == '*'){
                            this.token = "*"
                        }else if(this.token == "*" && c == '/'){
                            this.token = ""
                            this.comment = false
                        }else{
                            this.token = ""
                        }
                        continue
                    }
                    if(this.str){
                        if(c == '\\'){
                            this.token = "\\"
                        }else if(this.token != "\\" && c == '\"'){
                            this.token = ""
                            this.str = false
                        }else{
                            this.token = ""
                        }
                        continue
                    }
                    if(c <= ' '){ // skip whitespace and non-printable
                        if(this.token != ""){
                            const ret = this.token
                            this.token = ""
                            return ret
                        }
                    }else if(['{', '}', '(', ')', '[', ']', '<', '>', ';', ',', ':', '='].includes(c)){
                        if(this.token == ""){
                            return "" + c
                        }else{
                            const ret = this.token
                            this.token = ""
                            this.pos--
                            return ret
                        }
                    }else{
                        this.token += c
                        if(this.token == "//"){
                            this.token = ""
                            break // next line
                        }
                        if(this.token.endsWith("/*")){
                            this.token = ""
                            this.comment = true
                        }
                        if(this.token.endsWith("\"")){
                            this.token = ""
                            this.str = true
                        }
                    }
                }
                this.lineno++
                this.pos = 0
                if(this.token != ""){
                    const ret = this.token
                    this.token = ""
                    return ret
                }
            }
            return ""
        }else{
            return ""
        }
    }

    public provideDocumentSymbols(document: vscode.TextDocument,
        token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[]>
    {
        return new Promise((resolve, reject) =>
        {
            this.document = document
            this.lineno = 0
            this.pos = 0
            this.token = ""

            const symbols: vscode.DocumentSymbol[] = [];
            const nodes = [symbols]
            let depths = [0]
            let depth = 0

            let prev_token = ""
            let parsing = ""
            let parsing_symbol: vscode.DocumentSymbol | undefined
            let expect_open = false

            for (let token = this.nextToken(); token != ""; token = this.nextToken()) {
                console.log(prev_token + " -> " + token)
                if(!this.line){
                    continue
                }

                if(token == "{"){
                    depth++
                    if(expect_open){
                        depths.push(depth)
                        expect_open = false
                        parsing = ""
                    }
                }else if(token == "}"){
                    if(depth == depths[depths.length-1]){
                        depths.pop()
                        nodes.pop()
                    }
                    depth--
                }else if(token == ";"){
                    prev_token = ""
                    parsing = ""
                    parsing_symbol = undefined
                    if(expect_open){
                        // Was looking for an open brace but got semicolon
                        // need to pop the node, there will be no children
                        nodes.pop()
                        expect_open = false
                    }
                }else if(parsing == "method" || parsing == "fun"){
                    if(parsing_symbol){
                        if(expect_open && token == "("){
                            expect_open = false
                        }
                        if(token != "="){
                            prev_token = token
                        }
                        if(token == ")"){
                            expect_open = true
                        }else if(token == ":"){
                            expect_open = true
                            parsing = ""
                            parsing_symbol = undefined
                        }
                    }
                }else if(parsing == "unit" && token == ","){
                    // multiple units can be declared comma separated, abuse prev_token to collect the next one
                    prev_token = "unit"
                }else if(prev_token == "type"){
                    const symbol = new vscode.DocumentSymbol(
                        token, '',
                        vscode.SymbolKind.Struct,
                        this.line.range, this.line.range)

                    nodes[nodes.length-1].push(symbol)
                    nodes.push(symbol.children)
                    expect_open = true
                    prev_token = ""
                }
                else if(prev_token == "method"){
                    const symbol = new vscode.DocumentSymbol(
                        token, '',
                        vscode.SymbolKind.Method,
                        this.line.range, this.line.range)

                    nodes[nodes.length-1].push(symbol)
                    nodes.push(symbol.children)
                    expect_open = true
                    prev_token = ""
                    parsing = "method"
                    parsing_symbol = symbol
                }
                else if(prev_token == "fun"){
                    const symbol = new vscode.DocumentSymbol(
                        token, '',
                        vscode.SymbolKind.Function,
                        this.line.range, this.line.range)

                        console.log(nodes.length)
                    nodes[nodes.length-1].push(symbol)
                    nodes.push(symbol.children)
                    expect_open = true
                    prev_token = ""
                    parsing = "fun"
                    parsing_symbol = symbol
                }
                else if(prev_token == "var") {
                    const symbol = new vscode.DocumentSymbol(
                        token, '',
                        vscode.SymbolKind.Variable,
                        this.line.range, this.line.range)

                    nodes[nodes.length-1].push(symbol)
                    prev_token = ""
                }
                else if(prev_token == "unit") {
                    const symbol = new vscode.DocumentSymbol(
                        token, 'unit',
                        vscode.SymbolKind.Number,
                        this.line.range, this.line.range)

                    nodes[nodes.length-1].push(symbol)
                    prev_token = ""
                    parsing = "unit"
                }else{
                    prev_token = token
                }
                /*else if(token == "type"){
                    prev_token = "type"
                }else if(token == "method"){
                    prev_token = "method"
                }else if(token == "fun"){
                    prev_token = "fun"
                }else if(token == "var"){
                    prev_token = "var"
                }else if(token == "unit"){
                    prev_token = "unit"
                }*/

            }
            resolve(symbols);
        });
    }
}