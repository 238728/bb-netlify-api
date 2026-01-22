// netlify/functions/bb.js（最终版，100%解决CORS）
require('dotenv').config();
const { MongoClient } = require('mongodb');

// MongoDB连接逻辑（不变）
let mongoClient;
async function connectMongo() {
  if (mongoClient) return mongoClient;
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) throw new Error('MONGODB_URI未配置');
  
  mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  return mongoClient;
}

// 🔥 关键：跨域头强制覆盖所有场景
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*', // 本地测试用*，生产改你的域名
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400', // 预检请求缓存1天，减少OPTIONS请求
  'Content-Type': 'application/json; charset=utf-8'
};

// Netlify Functions核心处理
exports.handler = async (event) => {
  // 1. 优先处理OPTIONS预检请求（跨域必过的关键）
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204, // 204比200更标准，无响应体
      headers: CORS_HEADERS,
      body: ''
    };
  }

  try {
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
        headers: CORS_HEADERS, // 强制加跨域头
        body: JSON.stringify({ code: 200, data: result })
      };
    }

    // 3. POST请求：发布说说
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      if (!body.content || body.content.trim() === '') {
        return {
          statusCode: 400,
          headers: CORS_HEADERS, // 错误响应也加跨域头
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
        headers: CORS_HEADERS,
        body: JSON.stringify({ code: 200, message: '发布成功' })
      };
    }

    // 4. 不支持的请求方法
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ code: 405, error: '仅支持GET/POST/OPTIONS' })
    };

  } catch (error) {
    console.error('API错误：', error);
    // 5. 异常响应也必须加跨域头！
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ code: 500, error: '服务器内部错误' })
    };
  }
};