'use strict'

var path = require('path')
var fs = require('fs')

function NPMBrunch(config) {
    var npm = config.plugins.npm || {}
    
    this.config = config
    this.adapters = npm.adapters || defaultAdapters
}
NPMBrunch.prototype.brunchPlugin = true
NPMBrunch.prototype.type = 'javascript'

var defaultAdapters = {
    'ws': function(data) {
        return 'if(typeof window !== "undefined") { module.exports = window.WebSocket; return; }\n'
                + data
    },
    'xmlhttprequest': function(data) {
        return 'if(typeof window !== "undefined") { module.exports = window.XMLHttpRequest; return; }\n'
                + data
    }
}

// exported for unit testing
NPMBrunch.requireRegex = /require\s*\(\s*(?:"([^"\n]+)"|'([^'\n]+)')\s*\)/
NPMBrunch.dependenciesOf = function dependenciesOf(source) {
    var results = []
    
    var repeat = true
    while(repeat) {
        repeat = false
        source = source.replace(NPMBrunch.requireRegex, function(_, matchA, matchB) {
            repeat = true
            if(!matchA && !matchB)
                throw new Error(source)
            results.push(matchA || matchB)
        })
    }
    
    return results
}

function recursiveDependenciesOf(source, sourcePath, rootPath, adapters, result, skipShallowRelativeImports) {
    NPMBrunch.dependenciesOf(source).forEach(function(dep) {
        var resolvedDep
        if(isRelative.test(dep)) {
            if(skipShallowRelativeImports)
                return
            
            resolvedDep = getRelativeModule(sourcePath, dep)
        }
        else {
            resolvedDep = getNodeModule(sourcePath, dep)
        }
        
        if(!resolvedDep)
            return // it's either a built-in module or a conditional import
            
        var relativePath = resolvedDep.path.substring(rootPath.length + 1) // add 1 for leading slash
        if(relativePath in result)
            return
        
        var data = fs.readFileSync(resolvedDep.path).toString()
        if(path.extname(resolvedDep.path).toLowerCase() === '.json')
            data = 'module.exports = ' + data
        
        if(dep in adapters)
            data = adapters[dep](data)
        
        result[relativePath] = data
        if(resolvedDep.alias) {
            result['$aliases'][resolvedDep.alias.substring(rootPath.length + 1)] = relativePath
        }
        
        recursiveDependenciesOf(data, resolvedDep.path, rootPath, adapters, result)
    })
}

function getRelativeModule(sourcePath, modPath) {
    var joinedModPath = path.join(path.dirname(sourcePath), modPath)
    
    var possibilities = [joinedModPath]
    
    if(joinedModPath[joinedModPath.length - 1] === '/') {
        possibilities.push(joinedModPath + 'index.js', joinedModPath + 'index.json')
    }
    else {
        possibilities.push(joinedModPath + '.js', joinedModPath + '.json',
                           joinedModPath + '/index.js', joinedModPath + '/index.json')
    }
        
    for(var i = 0; i < possibilities.length; i += 1) {
        if(fs.existsSync(possibilities[i]))
            if(fs.statSync(possibilities[i]).isFile())
                return {path: possibilities[i]}
    }
}

function getNodeModule(sourcePath, modPath) {
    var sourcePathParts = path.dirname(sourcePath).split('/')
    
    while(true) {
        var joinedModPath = path.join('/', sourcePathParts.join('/'), 'node_modules', modPath)
        var possibilities = [{path: joinedModPath},
                             {path: joinedModPath + '.js'},
                             {path: joinedModPath + '.json'},
                             {path: joinedModPath + '/index.js'},
                             {path: joinedModPath + '/index.json'}]
                             
        if(fs.existsSync(joinedModPath + '/package.json')) {
            var info = JSON.parse(fs.readFileSync(joinedModPath + '/package.json').toString())
            if(typeof info.browser === 'string') {
                possibilities.push({path: path.join(joinedModPath, info.browser), alias: joinedModPath})
                possibilities.push({path: path.join(joinedModPath, info.browser) + '.js', alias: joinedModPath})
                possibilities.push({path: path.join(joinedModPath, info.browser) + '.json', alias: joinedModPath})
                possibilities.push({path: path.join(joinedModPath, info.browser, 'index.js'), alias: joinedModPath})
                possibilities.push({path: path.join(joinedModPath, info.browser, 'index.json'), alias: joinedModPath})
            }
            if(typeof info.main === 'string') {
                possibilities.push({path: path.join(joinedModPath, info.main), alias: joinedModPath})
                possibilities.push({path: path.join(joinedModPath, info.main) + '.js', alias: joinedModPath})
                possibilities.push({path: path.join(joinedModPath, info.main) + '.json', alias: joinedModPath})
                possibilities.push({path: path.join(joinedModPath, info.main, 'index.js'), alias: joinedModPath})
                possibilities.push({path: path.join(joinedModPath, info.main, 'index.json'), alias: joinedModPath})
            }
        }
        
        for(var i = 0; i < possibilities.length; i += 1) {
            var possibility = possibilities[i]
            if(fs.existsSync(possibility.path))
                if(fs.statSync(possibility.path).isFile())
                    return possibility
        }
        
        if(sourcePathParts.length)
            sourcePathParts.pop()
        else
            return undefined
    }
}

var isRelative = /^\.\.?(\/|$)/

NPMBrunch.prototype.onCompile = function(generatedFiles) {
    var _this = this
    
    generatedFiles.forEach(function(genFile) {
        var dependencies = {'$aliases':{}}
        
        genFile.sourceFiles.forEach(function(sourceFile) {
            if(sourceFile.type !== 'javascript')
                return
            if(sourceFile.removed)
                return console.log(sourceFile.path, 'removed')
            
            var rootPath = path.resolve(_this.config.paths.root)
            recursiveDependenciesOf(sourceFile.data, path.join(rootPath, sourceFile.path), rootPath, _this.adapters, dependencies, true)
        })
        
        var newSource = [fs.readFileSync(genFile.path)]
        Object.keys(dependencies).forEach(function(key) {
            if(key === '$aliases')
                return
            var source = dependencies[key]
            newSource.push('\nrequire.register("')
            newSource.push(key)
            newSource.push('", function(exports, require, module) {\n')
            newSource.push(source)
            newSource.push('\n});\n')
        })
        Object.keys(dependencies['$aliases']).forEach(function(key) {
            newSource.push('\nrequire.alias("')
            newSource.push(dependencies['$aliases'][key])
            newSource.push('", "')
            newSource.push(key)
            newSource.push('");\n')
        })
        fs.writeFileSync(genFile.path, newSource.join(''))
    })
}

module.exports = NPMBrunch
