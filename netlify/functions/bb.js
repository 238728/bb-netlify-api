// netlify/functions/shuo.js（修复后，无cors依赖）
require('dotenv').config(); // 本地测试用，线上可保留
const { MongoClient } = require('mongodb');

// MongoDB全局客户端（单例连接）
let mongoClient;

// 连接MongoDB Atlas
async function connectMongo() {
  if (mongoClient) return mongoClient;
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) throw new Error('请配置MONGODB_URI环境变量');
  
  mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  console.log('MongoDB连接成功（独立API服务）');
  return mongoClient;
}

// 通用跨域头（所有响应都加这些头，解决跨域）
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*', // 生产环境改为你的域名，如'https://xxx.netlify.app'
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// Netlify Functions核心处理函数（移除cors库，手动加跨域头）
exports.handler = async (event, context) => {
  // 处理OPTIONS预检请求（跨域必需，浏览器会先发OPTIONS请求）
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: 'OPTIONS预检成功' })
    };
  }

  try {
    // 1. 连接MongoDB，获取集合
    const client = await connectMongo();
    const db = client.db('shuo');
    const shuoCollection = db.collection('shuolist');

    // 2. GET请求：查询说说
    if (event.httpMethod === 'GET') {
      const shuos = await shuoCollection.find({})
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray();
      
      const result = shuos.map(item => ({
        id: item._id.toString(),
        content: item.content,
        createTime: item.createTime,
        like: item.like || 0
      }));

      return {
        statusCode: 200,
        headers: CORS_HEADERS, // 加跨域头
        body: JSON.stringify({ code: 200, data: result })
      };
    }

    // 3. POST请求：发布说说
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      
      if (!body.content || body.content.trim() === '') {
        return {
          statusCode: 400,
          headers: CORS_HEADERS, // 加跨域头
          body: JSON.stringify({ code: 400, error: '说说内容不能为空' })
        };
      }

      const newShuo = {
        content: body.content.trim(),
        createTime: new Date().toLocaleString('zh-CN', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        }),
        like: 0,
        createdAt: new Date()
      };

      await shuoCollection.insertOne(newShuo);

      return {
        statusCode: 200,
        headers: CORS_HEADERS, // 加跨域头
        body: JSON.stringify({ code: 200, message: '发布成功' })
      };
    }

    // 4. 不支持的请求方法
    return {
      statusCode: 405,
      headers: CORS_HEADERS, // 加跨域头
      body: JSON.stringify({ code: 405, error: '仅支持GET/POST/OPTIONS请求' })
    };

  } catch (error) {
    console.error('API错误：', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS, // 加跨域头
      body: JSON.stringify({ code: 500, error: '服务器内部错误' })
    };
  }
};