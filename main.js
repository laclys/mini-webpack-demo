/*
 * @Author: Lac 
 * @Date: 2019-03-18 18:15:07 
 * @Last Modified by: Lac
 * @Last Modified time: 2019-03-18 18:43:17
 */

const fs = require("fs")
const path = require("path")
const babylon = require("@babel/parser") // 负责解析字符串并生产ast
const traverse = require("@babel/traverse").default
const babel = require("@babel/core")


let ID = 0

/**
 * 读取文件信息 && 获取当前文件的依赖关系
 * @param {*} fileName 
 */
function createAsset(fileName) {
  const content = fs.readFileSync(fileName, "utf-8")

  const ast = babylon.parse(content, {
    sourceType: "module"
  })

  // 文件依赖(import那些文件)
  const dependencies = []

  //遍历当前ast（抽象语法树）
  traverse(ast, {
    //找到有 `import`的对应节点
    ImportDeclaration: ({
      node
    }) => {
      // 把当前依赖的模块加入到数组中，其实这存的是字符串，
      // eg:import message from './message.js'， 
      // './message.js' === node.source.value
      dependencies.push(node.source.value);
    }
  })

  // ES6 -> ES5
  const {
    code
  } = babel.transformFromAstSync(ast, null, {
    presets: ["@babel/preset-env"]
  })

  const id = ID++

  return {
    id,
    fileName,
    dependencies,
    code
  }
}

/**
 * 从入口开始，广度遍历所有依赖项（dependencies）
 * @param {*} entry 
 */
function createGraph(entry) {
  const mainAsset = createAsset(entry)

  const queue = [mainAsset]

  for (const asset of queue) {
    const dirname = path.dirname(asset.fileName)

    // 新增一个属性来保存子依赖项的数据
    // {"./message.js" : 1}
    asset.mapping = {}

    asset.dependencies.forEach(relativePath => {
      const absolutePath = path.join(dirname, relativePath);

      //获得子依赖（子模块）的依赖项、代码、模块id，文件名
      const child = createAsset(absolutePath);

      //给子依赖项赋值
      asset.mapping[relativePath] = child.id;

      //将子依赖也加入队列中，广度遍历
      queue.push(child);
    })
  }
  return queue
}

/**
 * 打包！
 * @param {*} graph 
 */
function bundle(graph) {
  let modules = ''

  graph.forEach(mod => {
    modules += `${mod.id}: [
      function (require, module, exports){
        ${mod.code}
      },
      ${JSON.stringify(mod.mapping)},
    ],`
  })

  // 由于cjs标准在浏览器里不能直接使用，这里模拟cjs模块加载，执行，导出操作
  const result = `
    (function(modules){
      //创建require函数， 它接受一个模块ID
      function require(id){
        const [fn, mapping] = modules[id]
        function localRequire(relativePath){
          
          //根据模块的路径在mapping中找到对应的模块id
          return require(mapping[relativePath])
        }

        const module = {exports:{}}
        //执行每个模块的代码。
        fn(localRequire,module,module.exports);
        return module.exports;
      }
      //执行入口文件，
      require(0)
    })({${modules}})
  `
  return result
}

// test
const graph = createGraph('./example/entry.js')
const ret = bundle(graph)

fs.writeFileSync('./bundle.js', ret)