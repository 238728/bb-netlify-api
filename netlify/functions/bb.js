// netlify/functions/shuo.js（独立API的核心逻辑）
const { MongoClient } = require('mongodb');
const cors = require('cors');

// 初始化CORS：允许所有域名调用（或限定你的博客/发布页面域名，更安全）
const corsMiddleware = cors({
  origin: '*', // 生产环境建议改为：['https://你的astro博客域名', 'https://你的发布页面域名']
  methods: ['GET', 'POST'],
  credentials: true
});

// MongoDB全局客户端（单例连接，避免重复创建连接）
let mongoClient;

// 连接MongoDB Atlas
async function connectMongo() {
  if (mongoClient) return mongoClient;
  // 从Netlify环境变量读取MongoDB连接字符串（部署时配置）
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) throw new Error('请配置MONGODB_URI环境变量');
  
  mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  console.log('MongoDB连接成功（独立API服务）');
  return mongoClient;
}

// Netlify Functions核心处理函数
exports.handler = async (event, context) => {
  // 处理CORS跨域
  return new Promise((resolve, reject) => {
    corsMiddleware(event, context, async (err) => {
      if (err) {
        return resolve({
          statusCode: 403,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: 403, error: '跨域访问被拒绝' })
        });
      }

      try {
        // 1. 连接MongoDB，获取集合
        const client = await connectMongo();
        const db = client.db('shuo'); // 数据库名（和MongoDB Atlas一致）
        const shuoCollection = db.collection('shuolist'); // 说说集合名

        // 2. GET请求：查询说说（给Astro博客调用）
        if (event.httpMethod === 'GET') {
          const shuos = await shuoCollection.find({})
            .sort({ createdAt: -1 }) // 按发布时间倒序
            .limit(100) // 限制最多返回100条
            .toArray();
          
          // 格式化返回数据（隐藏MongoDB原生字段）
          const result = shuos.map(item => ({
            id: item._id.toString(),
            content: item.content,
            createTime: item.createTime,
            like: item.like || 0
          }));

          return resolve({
            statusCode: 200,
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*' // 确保跨域生效
            },
            body: JSON.stringify({ code: 200, data: result })
          });
        }

        // 3. POST请求：发布说说（给移动端发布页面调用）
        if (event.httpMethod === 'POST') {
          const body = JSON.parse(event.body || '{}');
          
          // 数据校验：内容不能为空
          if (!body.content || body.content.trim() === '') {
            return resolve({
              statusCode: 400,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: 400, error: '说说内容不能为空' })
            });
          }

          // 构造说说数据
          const newShuo = {
            content: body.content.trim(),
            createTime: new Date().toLocaleString('zh-CN', {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit', second: '2-digit'
            }),
            like: 0,
            createdAt: new Date() // 原始时间戳，用于排序
          };

          // 插入MongoDB
          await shuoCollection.insertOne(newShuo);

          return resolve({
            statusCode: 200,
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ code: 200, message: '发布成功' })
          });
        }

        // 4. 不支持的请求方法
        return resolve({
          statusCode: 405,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: 405, error: '仅支持GET/POST请求' })
        });

      } catch (error) {
        console.error('API错误：', error);
        return resolve({
          statusCode: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: 500, error: '服务器内部错误' })
        });
      }
    });
  });
};