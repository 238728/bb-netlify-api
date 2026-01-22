// netlify/functions/bb.js（Token令牌版）
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

// MongoDB连接逻辑（不变）
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

// 跨域头配置（新增允许Authorization请求头）
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS, HEAD',
  // 🔥 新增：允许Authorization请求头（携带Token）
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json; charset=utf-8'
};

// 🔥 核心：管理员Token校验函数
function checkAdminToken(event) {
  // 1. 从Netlify环境变量读取管理员Token（安全存储）
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
  if (!ADMIN_TOKEN) return false;

  // 2. 从请求头获取Authorization字段（格式：Bearer <Token>）
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader) return false;

  // 3. 解析Token（去掉Bearer前缀，忽略大小写/空格）
  const [bearer, token] = authHeader.split(' ');
  if (!bearer || bearer.toLowerCase() !== 'bearer' || !token) return false;

  // 4. 校验Token是否匹配
  return token.trim() === ADMIN_TOKEN.trim();
}

// Netlify Functions核心处理
exports.handler = async (event) => {
  // 处理OPTIONS预检请求（必须允许Authorization头）
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

    // 1. GET请求：无需Token，保持开放
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

    // 2. POST请求：发布说说（需合法Token）
    if (event.httpMethod === 'POST') {
      // 🔥 先校验Token，不通过直接返回权限不足
      if (!checkAdminToken(event)) {
        return {
          statusCode: 403,
          headers: CORS_HEADERS,
          body: JSON.stringify({ code: 403, error: '权限不足：请携带合法的管理员Token' })
        };
      }

      // Token校验通过，再校验内容
      const body = JSON.parse(event.body || '{}');
      if (!body.content || body.content.trim() === '') {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ code: 400, error: '说说内容不能为空' })
        };
      }

      // 执行发布操作
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
        body: JSON.stringify({ code: 200, message: '发布成功（管理员Token验证通过）' })
      };
    }

    // 3. DELETE请求：删除说说（需合法Token）
    if (event.httpMethod === 'DELETE') {
      // 🔥 先校验Token
      if (!checkAdminToken(event)) {
        return {
          statusCode: 403,
          headers: CORS_HEADERS,
          body: JSON.stringify({ code: 403, error: '权限不足：请携带合法的管理员Token' })
        };
      }

      // Token校验通过，再校验ID
      const { id } = event.queryStringParameters || JSON.parse(event.body || '{}');
      if (!id) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ code: 400, error: '缺少说说ID，无法删除' })
        };
      }
      if (!ObjectId.isValid(id)) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ code: 400, error: '说说ID格式错误' })
        };
      }

      // 执行删除操作
      const deleteResult = await shuoCollection.deleteOne({ _id: new ObjectId(id) });
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
        body: JSON.stringify({ code: 200, message: '删除成功（管理员Token验证通过）' })
      };
    }

    // 不支持的请求方法
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