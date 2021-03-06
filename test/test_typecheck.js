"use strict";

const Q = require('q');
const fs = require('fs');

const AppGrammar = require('../lib/grammar_api');
const SchemaRetriever = require('../lib/schema');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const _mockMemoryClient = require('./mock_memory_client');

const _schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, _mockMemoryClient, true);

function typecheckTest() {
    var code = fs.readFileSync('./test/sample.apps').toString('utf8').split('====');

    Q.all(code.map((code) => {
        code = code.trim();
        return Q(AppGrammar.parseAndTypecheck(code, _schemaRetriever)).then(() => {
            if (code.indexOf(`** typecheck: expect `) >= 0) {
                console.error('Failed (expected error)');
                console.error(code);
            }
        }, (e) => {
            if (code.indexOf(`** typecheck: expect ${e.name} **`) >= 0)
                return;
            console.error('Failed');
            console.error(code);
            console.error(e);
            if (process.env.TEST_MODE)
                throw e;
        });
    })).done();
}

typecheckTest();
