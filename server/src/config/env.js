import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const missing = ['MONGODB_URI', 'JWT_SECRET'].filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required env: ${missing.join(', ')}. Copy .env.example to .env and fill it in.`);
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be at least 32 characters long.');
  process.exit(1);
}

export const env = {
  port: Number(process.env.PORT) || 5000,
  isProd: process.env.NODE_ENV === 'production',
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  google: {
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    // .env files store the key on one line with literal "\n"
    privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
};

export const cloudinaryEnabled = Boolean(
  env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret,
);
export const googleEnabled = Boolean(env.google.email && env.google.privateKey);
