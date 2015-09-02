'use strict'

var NPMBrunch = require('..')
var reg = NPMBrunch.requireRegex
var dependenciesOf = NPMBrunch.dependenciesOf

describe('regex', function() {
    it('works', function() {
        var matchables = [
            'var qwer = require("uiop")',
            "var qwer = require('uiop')",
            "var qwer = require ('uiop')",
            "var qwer = require('uiop' )",
            "var qwer = require('uiop'  )",
            "var qwer = require( 'uiop')",
            "var qwer = require(  'uiop')",
            "var qwer = require( 'uiop' )",
            "var qwer = require ( 'uiop' )",
            "var qwer =require('uiop')",
            'var qwer = require("uiop");',
            "var  qwer = require('uiop') ;",
            "var qwer = require ('uiop');",
            "var qwer = require('uiop' );",
            "var   qwer = require('uiop'  );",
            "var qwer = require( 'uiop');",
            " var qwer= require(  'uiop');",
            ' var qwer= require( "uiop" );  ',
            "var qwer = require ( 'uiop' );",
            "var qwer =require('uiop');",
            '\nvar qwer = require("uiop")\n',
            'var qwer =\nrequire("uiop")',
            'var qwer = require(\n"uiop")',
            'var qwer = require("uiop"\n)',
            'var qwer = require\n("uiop")',
            'var qwer = require(\n"uiop"\n)',
            'var qwer = require\n(\n"uiop"\n)'
        ]
        
        for(var i = 0; i < matchables.length; i += 1) {
            var execution = reg.exec(matchables[i])
            expect(execution[1] || execution[2]).toBe('uiop')
        }
        
        var unmatchables = [
            'var qwer = require(uiop)',
            'var qwer = require()',
            'var qwer = require("")',
            "var qwer = require('')",
            'var qwer = require(")',
            'var qwer = require("uiop)',
            'var qwer = requir("uiop")',
            'var qwer = require(("uiop")',
            "require('asdf', 'qwer')",
            "zxcv('uiop')",
            "require('uiop\n')"
        ]
        
        for(var i = 0; i < unmatchables.length; i += 1) {
            expect(reg.test(unmatchables[i])).toBe(false)
        }
    })
})

describe('Dependencies', function() {
    it('detects direct dependencies', function() {
        expect(dependenciesOf('var z = require ( "qwer")\n var q = require("q/e/r")'))
            .toEqual(['qwer', 'q/e/r'])
    })
})
