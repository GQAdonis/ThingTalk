// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const adt = require('adt');
const assert = require('assert');

const Type = require('./type');
const Ast = require('./ast');
const Builtin = require('./builtin');

// A register-based IR for ThingTalk to JS
// Typed like ThingTalk

// A sequence of instructions
class Block {
    constructor() {
        this._instructions = [];
    }

    add(instr) {
        this._instructions.push(instr);
    }

    codegen(prefix) {
        return this._instructions.map((i) => i.codegen(prefix)).join('\n');
    }
}

class CreateTuple {
    constructor(size, into) {
        this._size = size;
        this._into = into;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._into + ' = new Array(' + this._size + ');';
    }
}

class SetIndex {
    constructor(tuple, idx, value) {
        this._tuple = tuple;
        this._idx = idx;
        this._value = value;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._tuple + '[' + this._idx + '] = _t_' + this._value + ';';
    }
}

class ReadTriggerValue {
    constructor(ast, param, into) {
        this._into = into;
        const idx = ast.schema.index[param];
        assert(idx >= 0 && idx < ast.schema.args.length);
        this._index = idx;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._into + ' = env.triggerValue[' + this._index + '];'
    }
}

class ReadQueryValue {
    constructor(ast, param, into) {
        this._into = into;
        const idx = ast.schema.index[param];
        assert(idx >= 0 && idx < ast.schema.args.length);
        this._index = idx;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._into + ' = env.queryValue[' + this._index + '];'
    }
}

class SetVariable {
    constructor(variable, from) {
        this._variable = variable;
        this._from = from;
    }

    codegen(prefix) {
        return prefix + 'env._scope.' + this._variable + ' = ' + '_t_' + this._from + ';';
    }
}

class GetVariable {
    constructor(variable, into) {
        this._variable = variable;
        this._into = into;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._into + ' = env._scope.' + this._variable + ';';
    }
}

function stringEscape(str) {
    return '"' + str.replace(/([\"\\])/g, '\\$1').replace(/\n/g, '\\n') + '"';
    // the following comment fixes broken syntax highlighting in GtkSourceView
    //]/
}

function valueToJSSource(value) {
    var js = value.toJS();
    if (typeof js === 'string')
        return stringEscape(js);
    if (value.isLocation)
        return '{ x: ' + value.lon + ', y: ' + value.lat + ', display: ' + value.display ? stringEscape(value.display) : value.display + ' }';
    if (js instanceof Date)
        return 'new Date( ' + js.getTime() + ')';
    return String(js);
}

class LoadConstant {
    constructor(constant, into) {
        this._constant = constant;
        this._into = into;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._into + ' = ' + valueToJSSource(this._constant) + ';';
    }
}

class FormatEvent {
    constructor(hint, into) {
        this._hint = hint;
        this._into = into;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._into + ' = env.formatEvent(' + stringEscape(hint) + ');';
    }
}

class BinaryOp {
    constructor(a, b, op, into) {
        this._a = a;
        this._b = b;
        this._op = op;
        this._into = into;
    }

    _codegenFunc(prefix, func) {
        return prefix + '_t_' + this._into + ' = ' + func + '(' + '_t_' + this._a + ', ' + '_t_' + this._b + ');';
    }

    codegen(prefix) {
        if (this._op === '=~') {
            return this._codegenFunc(prefix, '__builtin.like');
        } else if (this._op === 'contains') {
            return this._codegenFunc(prefix, '__builtin.contains');
        } else if (this._op === '=') {
            return this._codegenFunc(prefix, '__builtin.equality');
        } else {
            return prefix + '_t_' + this._into + ' = ' + '_t_' + this._a + ' ' + this._op + ' ' + '_t_' + this._b + ';';
        }
    }
}

class UnaryOp {
    constructor(v, op, into) {
        this._v = v;
        this._op = op;
        this._into = into;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._into + ' = ' + this._op + ' ' + '_t_' + this._v + ';';
    }
}

class Return {
    constructor(v) {
        this._v = v;
    }

    codegen(prefix) {
        if (typeof this._v === 'string')
            return prefix + 'return ' + this._v + ';';
        else
            return prefix + 'return _t_' + this._v + ';';
    }
}

class IfStatement {
    constructor(cond) {
        this._cond = cond;
        this.iftrue = new Block;
        this.iffalse = new Block;
    }

    codegen(prefix) {
        return prefix + 'if (_t_' + this._cond + ') {\n' +
            this.iftrue.codegen(prefix + '  ') + '\n'
            + prefix + '} else {\n' +
            this.iffalse.codegen(prefix + '  ') + '\n'
            + prefix + '}';
    }
}

class RootBlock extends Block {
    constructor() {
        super();
        this._temps = [];
    }

    declare(reg) {
        this._temps.push(reg);
    }
    codegen(prefix) {
        return this._temps.map((t) => prefix + '  var _t_' + t + ';\n').join('') +
            super.codegen(prefix+'  ');
    }
}

class IRBuilder {
    constructor() {
        this._nextRegister = 0;
        this._root = new RootBlock;
        this._registerTypes = new Map;

        this._blockStack = [this._root];
    }

    codegen() {
        for (var reg of this._registerTypes.keys())
            this._root.declare(reg);
        return this._root.codegen('');
    }
    compile() {
        let code = this.codegen();
        //console.log('function(env) {\n' + code + '\n}');
        return new Function('__builtin', 'env', code).bind(Builtin);
    }

    get _currentBlock() {
        return this._blockStack[this._blockStack.length-1];
    }

    getRegisterType(reg) {
        return this._registerTypes.get(reg) || Type.Any;
    }

    allocRegister(type) {
        var reg = this._nextRegister++;
        this._registerTypes.set(reg, type);
        return reg;
    }
    newBlock() {
        return new Block();
    }
    pushBlock(block) {
        this._blockStack.push(block);
    }
    popBlock() {
        this._blockStack.pop();
        if (this._blockStack.length === 0)
            throw new Error('Invalid pop');
    }
    add(instr) {
        this._currentBlock.add(instr);
    }
}

module.exports = {
    IRBuilder,
    IfStatement,
    CreateTuple,
    SetIndex,
    ReadTriggerValue,
    ReadQueryValue,
    GetVariable,
    SetVariable,
    LoadConstant,
    BinaryOp,
    UnaryOp,
    Return,
};
