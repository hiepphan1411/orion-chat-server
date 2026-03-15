export default () => ({
  database: {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '123456789',
    database: process.env.DB_NAME || 'orion_chat',
  },
  mongodb: {
    uri: process.env.MONGO_URL || 'mongodb://localhost:27017/orion_chat',
  },
  esms: {
    apiKey: process.env.ESMS_API_KEY,
    secretKey: process.env.ESMS_SECRET_KEY,
    baseUrl: 'https://rest.esms.vn/MainService.svc/json',
    smsType: 2, // 1: Advertising SMS, 2: Notification/OTP SMS
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  server: {
    port: parseInt(process.env.PORT || '3000'),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
});
