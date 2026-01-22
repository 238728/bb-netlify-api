// netlify/functions/bb.js（最终版，含删除功能）
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb'); // 新增ObjectId，用于转换说说ID

// MongoDB连接逻辑（不变，保留超时配置）
let mongoClient;
async function connectMongo() {
  if (mongoClient) return mongoClient;
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) throw new Error('MONGODB_URI未配置');
  
  const clientOptions = {
    serverSelectionTimeoutMS: 5000,
    retryWrites: true,
    w: 'majority'
  };

  mongoClient = new MongoClient(MONGODB_URI, clientOptions);
  await mongoClient.connect();
  console.log('MongoDB连接成功');
  return mongoClient;
}

// 跨域头配置（不变，新增DELETE到允许的方法）
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS, HEAD', // 新增DELETE
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json; charset=utf-8'
};

// Netlify Functions核心处理（新增DELETE逻辑）
exports.handler = async (event) => {
  // 1. 处理OPTIONS预检请求（兼容DELETE的预检）
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  try {
    const client = await connectMongo();
    const db = client.db('shuo');
    const shuoCollection = db.collection('shuolist');

    // 2. GET请求：查询说说（不变）
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
        headers: CORS_HEADERS,
        body: JSON.stringify({ code: 200, data: result })
      };
    }

    // 3. POST请求：发布说说（不变）
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      if (!body.content || body.content.trim() === '') {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
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

    // 🔥 新增：DELETE请求：删除说说（核心删除逻辑）
    if (event.httpMethod === 'DELETE') {
      // 从请求参数中获取说说ID（支持URL参数或JSON body）
      const { id } = event.queryStringParameters || JSON.parse(event.body || '{}');
      
      // 校验ID是否存在且合法
      if (!id) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ code: 400, error: '缺少说说ID，无法删除' })
        };
      }

      // 校验ID格式（MongoDB的ObjectId必须是24位十六进制字符串）
      if (!ObjectId.isValid(id)) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ code: 400, error: '说说ID格式错误' })
        };
      }

      // 执行删除操作
      const deleteResult = await shuoCollection.deleteOne({ _id: new ObjectId(id) });
      
      // 判断是否删除成功（matchedCount=1表示找到并删除）
      if (deleteResult.deletedCount === 0) {
        return {
          statusCode: 404,
          headers: CORS_HEADERS,
          body: JSON.stringify({ code: 404, error: '说说不存在或已被删除' })
        };
      }

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ code: 200, message: '删除成功' })
      };
    }

    // 4. 不支持的请求方法
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ code: 405, error: '仅支持GET/POST/DELETE/OPTIONS' })
    };

  } catch (error) {
    console.error('API错误详情：', error.message, error.stack);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ 
        code: 500, 
        error: '服务器内部错误',
        detail: process.env.NODE_ENV === 'development' ? error.message : ''
      })
    };
  }
};