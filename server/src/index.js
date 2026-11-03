import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';

try {
  await connectDB();
  createApp().listen(env.port, () => {
    console.log(`BioHelix API running on http://localhost:${env.port}`);
  });
} catch (err) {
  console.error('Could not start the server:', err.message);
  process.exit(1);
}
