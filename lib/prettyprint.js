// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const { stringEscape } = require('./escaping');

function prettyprintType(ast) {
    if (ast.isTuple)
        return '(' + ast.schema.map(prettyprintType).join(', ') + ')';
    else if (ast.isArray)
        return 'Array(' + prettyprintType(ast.elem) + ')';
    else
        return ast.toString();
}

function prettyprintLocation(ast) {
    if (ast.isAbsolute && ast.display)
        return 'makeLocation(' + ast.lat + ', ' + ast.lon + ', ' + stringEscape(ast.display) + ')';
    else if (ast.isAbsolute)
        return 'makeLocation(' + ast.lat + ', ' + ast.lon + ')';
    else
        return '$context.location.' + ast.relativeTag;
}

function prettyprintDate(value, operator, offset) {
    let base;
    if (value === null)
        base = 'makeDate()';
    else if (value.isDateEdge)
        base = `${value.edge}(${value.unit})`;
    else
        base = `makeDate(${value.getTime()})`;
    return base + (offset ? ` ${operator} ${prettyprintValue(offset)}` : '');
}

function prettyprintValue(ast) {
    if (ast.isVarRef)
        return ast.name;
    else if (ast.isUndefined)
        return '$undefined' + (ast.local ? '' : '.remote');
    else if (ast.isArray)
        return `[${ast.value.map(prettyprintValue).join(', ')}]`;
    else if (ast.isBoolean)
        return String(ast.value);
    else if (ast.isString)
        return stringEscape(ast.value);
    else if (ast.isEnum)
        return `enum(${ast.value})`;
    else if (ast.isMeasure)
        return String(ast.value) + ast.unit;
    else if (ast.isCompoundMeasure && ast.value.length > 1)
        return `(${ast.value.map(prettyprintValue).join(' + ')})`;
    else if (ast.isCompoundMeasure)
        return prettyprintValue(ast.value[0]);
    else if (ast.isNumber)
        return String(ast.value);
    else if (ast.isCurrency)
        return `makeCurrency(${ast.value}, ${ast.code})`;
    else if (ast.isLocation)
        return prettyprintLocation(ast.value);
    else if (ast.isDate)
        return prettyprintDate(ast.value, ast.operator, ast.offset);
    else if (ast.isTime)
        return `makeTime(${ast.hour}, ${ast.minute})`;
    else if (ast.isEntity)
        return stringEscape(ast.value) + '^^' + ast.type + (ast.display ? '(' + stringEscape(ast.display) + ')' : '');
    else if (ast.isEvent)
        return '$event' + (ast.name ? '.' + ast.name : '');
    else
        throw new TypeError('Invalid value type ' + ast); // the other Value forms don't have literals
}

function prettyprintSelector(ast) {
    if (ast.isBuiltin)
        return '';

    if (ast.id && ast.principal) {
        return '@' + ast.kind + '(id=' + stringEscape(ast.id) +
            ',principal=' + prettyprintValue(ast.principal) + ')';
    }
    if (ast.id)
        return '@' + ast.kind + '(id=' + stringEscape(ast.id) + ')';
    if (ast.principal)
        return '@' + ast.kind + '(principal=' + prettyprintValue(ast.principal) + ')';
    return '@' + ast.kind;
}

function prettyprintInputParam(ast) {
    return ast.name + '=' + prettyprintValue(ast.value);
}

const INFIX_FILTERS = new Set(['>=', '<=', '>', '<', '=~', '~=', '==', '!=']);

function prettyprintExternalFilter(ast) {
    return `${prettyprintSelector(ast.selector)}.${ast.channel}(${ast.in_params.map(prettyprintInputParam).join(', ')}) { ${prettyprintFilterExpression(ast.filter)} }`;
}

function prettyprintFilterExpression(ast) {
    if (ast.isTrue || (ast.isAnd && ast.operands.length === 0))
        return 'true';
    if (ast.isFalse || (ast.isOr && ast.operands.length === 0))
        return 'false';
    if (ast.isNot)
        return `!(${prettyprintFilterExpression(ast.expr)})`;
    if (ast.isAnd)
        return `(${ast.operands.map(prettyprintFilterExpression).join(' && ')})`;
    if (ast.isOr)
        return `(${ast.operands.map(prettyprintFilterExpression).join(' || ')})`;
    if (ast.isExternal)
        return prettyprintExternalFilter(ast);

    if (INFIX_FILTERS.has(ast.operator))
        return `${ast.name} ${ast.operator} ${prettyprintValue(ast.value)}`;

    return `${ast.operator}(${ast.name}, ${prettyprintValue(ast.value)})`;
}

function prettyprintInvocation(ast) {
    if (!ast.selector)
        throw new Error('Invalid invocation ' + ast);
    if (ast.selector.isBuiltin)
        return ast.channel;
    return `${prettyprintSelector(ast.selector)}.${ast.channel}(${ast.in_params.map(prettyprintInputParam).join(', ')})`;
}

function prettyprintActionList(actions) {
    if (actions.length === 1)
        return prettyprintInvocation(actions[0]);
    else
        return `{\n${actions.map((a) => '        ' + prettyprintInvocation(a) + ';\n').join('')} }`;
}

function prettyprintRule(ast) {
    if (ast.isRule)
        return `    ${prettyprintStream(ast.stream)} => ${prettyprintActionList(ast.actions)};\n`;
    else if (ast.table === null)
        return `    now => ${prettyprintActionList(ast.actions)};\n`;
    else
        return `    now => ${prettyprintTable(ast.table)} => ${prettyprintActionList(ast.actions)};\n`;
}

const INFIX_OPERATORS = new Set(['+', '-', '/', '*', '%', '**']);
function prettyprintScalarExpression(expr) {
    if (expr.isPrimary)
        return prettyprintValue(expr.value);
    else if (expr.isDerived && INFIX_OPERATORS.has(expr.op))
        return `(${prettyprintScalarExpression(expr.operands[0])} ${expr.op} ${prettyprintScalarExpression(expr.operands[1])})`;
    else if (expr.isDerived)
        return `${expr.op}(${expr.operands.map(prettyprintScalarExpression).join(', ')})`;
    else
        throw new TypeError();
}

function prettyprintVarRef(ast) {
    let prefix = '';
    if (ast.principal)
        prefix = `${prettyprintValue(ast.principal)} :: `;
    return `${prefix}${ast.name}(${ast.in_params.map(prettyprintInputParam).join(', ')})`;
}

function prettyprintTable(table) {
    if (table.isVarRef)
        return prettyprintVarRef(table);
    else if (table.isInvocation)
        return prettyprintInvocation(table.invocation);
    else if (table.isFilter)
        return `(${prettyprintTable(table.table)}), ${prettyprintFilterExpression(table.filter)}`;
    else if (table.isProjection)
        return `[${table.args.join(', ')}] of (${prettyprintTable(table.table)})`;
    else if (table.isAlias)
        return `(${prettyprintTable(table.table)}) as ${table.name}`;
    else if (table.isCompute)
        return `compute ${prettyprintScalarExpression(table.expression)} ${table.alias !== null ? `as ${table.alias} ` : ''}of (${prettyprintTable(table.table)})`; //` <- GtkSourceView bug
    else if (table.isAggregation && table.operator === 'count' && table.field === '*')
        return `aggregate count ${table.alias !== null ? `as ${table.alias} ` : ''}of ${prettyprintTable(table.table)}`; //` <- GtkSourceView bug
    else if (table.isAggregation)
        return `aggregate ${table.operator} ${table.field} ${table.alias !== null ? `as ${table.alias} ` : ''}of ${prettyprintTable(table.table)}`; //` <- GtkSourceView bug
    else if (table.isArgMinMax)
        return `aggregate ${table.operator} ${prettyprintValue(table.base)}, ${prettyprintValue(table.limit)} ${table.field} of ${prettyprintTable(table.table)}`;
    else if (table.isJoin && table.in_params.length > 0)
        return `(${prettyprintTable(table.lhs)} join ${prettyprintTable(table.rhs)} on (${table.in_params.map(prettyprintInputParam).join(', ')}))`;
    else if (table.isJoin)
        return `(${prettyprintTable(table.lhs)} join ${prettyprintTable(table.rhs)})`;
    else if (table.isWindow)
        return `window ${prettyprintValue(table.base)}, ${prettyprintValue(table.delta)} of ${prettyprintStream(table.stream)}`;
    else if (table.isTimeSeries)
        return `timeseries ${prettyprintValue(table.base)}, ${prettyprintValue(table.delta)} of ${prettyprintStream(table.stream)}`;
    else if (table.isSequence)
        return `sequence ${prettyprintValue(table.base)}, ${prettyprintValue(table.delta)} of ${prettyprintTable(table.table)}`;
    else if (table.isHistory)
        return `history ${prettyprintValue(table.base)}, ${prettyprintValue(table.delta)} of ${prettyprintTable(table.table)}`;
    else
        throw new TypeError();
}

function prettyprintStream(stream) {
    if (stream.isVarRef)
        return prettyprintVarRef(stream);
    else if (stream.isTimer)
        return `timer(base=${prettyprintValue(stream.base)}, interval=${prettyprintValue(stream.interval)})`;
    else if (stream.isAtTimer)
        return `attimer(time=${prettyprintValue(stream.time)})`;
    else if (stream.isMonitor)
        return `monitor (${prettyprintTable(stream.table)})` + ((stream.args && stream.args.length) ? ` on new [${stream.args.join(', ')}]` : '');
    else if (stream.isEdgeNew)
        return `edge (${prettyprintStream(stream.stream)}) on new`;
    else if (stream.isEdgeFilter)
        return `edge (${prettyprintStream(stream.stream)}) on ${prettyprintFilterExpression(stream.filter)}`;
    else if (stream.isFilter)
        return `${prettyprintStream(stream.stream)}, ${prettyprintFilterExpression(stream.filter)}`;
    else if (stream.isProjection)
        return `[${stream.args.join(', ')}] of (${prettyprintStream(stream.stream)})`;
    else if (stream.isCompute)
        return `compute ${prettyprintScalarExpression(stream.expression)} ${stream.alias !== null ? `as ${stream.alias} ` : ''}of (${prettyprintStream(stream.stream)})`; //` <- GtkSourceView bug
    else if (stream.isAlias)
        return `(${prettyprintStream(stream.stream)}) as ${stream.name}`;
    else if (stream.isJoin && stream.in_params.length > 0)
        return `(${prettyprintStream(stream.stream)} join ${prettyprintTable(stream.table)} on (${stream.in_params.map(prettyprintInputParam).join(', ')}))`;
    else if (stream.isJoin)
        return `(${prettyprintStream(stream.stream)} join ${prettyprintTable(stream.table)})`;
    else
        throw new TypeError();
}

function prettyprintDeclaration(decl) {
    let args = Object.keys(decl.args);
    let types = args.map((a) => decl.args[a]);

    let arg_decl = args.length > 0 ? `\\(${args.map((a, i) => a + ' :' + prettyprintType(types[i])).join(', ')}) -> ` : '';

    let value;
    switch (decl.type) {
    case 'stream':
        value = prettyprintStream(decl.value);
        break;
    case 'table':
        value = prettyprintTable(decl.value);
        break;
    case 'action':
        value = prettyprintInvocation(decl.value);
        break;
    default:
        throw new TypeError();
    }

    return `    let ${decl.type} ${decl.name} := ${arg_decl}${value};\n`;
}

function prettyprintArgDef(fndef, argname) {
    if (fndef.inReq[argname])
        return 'in req ' + argname + ' : ' + fndef.inReq[argname];
    else if (fndef.inOpt[argname])
        return 'in opt ' + argname + ' : ' + fndef.inOpt[argname];
    else
        return 'out ' + argname + ' : ' + fndef.out[argname];
}

function prettyprintFunctionDef(prefix, ast) {
    return function(name) {
        return '        ' + prefix + ' ' + name + ' (' + ast[name].args.map((argname) => prettyprintArgDef(ast[name], argname)).join(', ') + ');\n';
    };
}

function prettyprintClassDef(ast) {
    return '    class @' + ast.name + ' extends @' + ast.extends + ' {\n' +
        Object.keys(ast.queries).map(prettyprintFunctionDef('query', ast.queries)) +
        Object.keys(ast.actions).map(prettyprintFunctionDef('action', ast.actions)) + '    }\n';
}

function prettyprint(ast, short) {
    let prefix;
    if (ast.principal !== null)
        prefix = 'executor = ' + prettyprintValue(ast.principal) + ' : ';
    else
        prefix = '';

    if (short && ast.classes.length === 0 && ast.declarations.length === 0 && ast.rules.length === 1)
        return prefix + prettyprintRule(ast.rules[0]).trim();
    if (short && ast.classes.length === 0 && ast.declarations.length === 1 && ast.rules.length === 0)
        return prefix + prettyprintDeclaration(ast.declarations[0]).trim();

    return prefix + '{\n' +
            ast.classes.map(prettyprintClassDef).join('') +
            ast.declarations.map(prettyprintDeclaration).join('') +
            ast.rules.map(prettyprintRule).join('') + '}';
}

function prettyprintPermissionFunction(fn) {
    if (fn.isStar)
        return '*';
    if (fn.isClassStar)
        return `@${fn.kind}.*`;

    if (fn.filter.isTrue)
        return `@${fn.kind}.${fn.channel}`;
    else
        return `@${fn.kind}.${fn.channel}, ${prettyprintFilterExpression(fn.filter)}`;
}

function prettyprintPermissionRule(allowed) {
    return `${prettyprintFilterExpression(allowed.principal)} : ${allowed.query.isBuiltin ? 'now' : prettyprintPermissionFunction(allowed.query)} => ${allowed.action.isBuiltin ? 'notify' : prettyprintPermissionFunction(allowed.action)};`;
}

module.exports = {
    prettyprint,
    prettyprintClassDef,
    prettyprintFilterExpression,
    prettyprintPermissionRule
};
