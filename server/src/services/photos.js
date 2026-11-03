import { v2 as cloudinary } from 'cloudinary';
import { env, cloudinaryEnabled } from '../config/env.js';
import { HttpError } from '../utils/http.js';

if (cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
}

/**
 * Upload a student photo as an "authenticated" asset: it cannot be opened by
 * guessing the URL, only through a signed link the server hands out.
 * Resized to 400x400 on upload so each photo stays small.
 */
export function uploadStudentPhoto(buffer, studentId, oldPublicId) {
  if (!cloudinaryEnabled) {
    throw new HttpError(503, 'Photo upload is not set up yet (add the CLOUDINARY_* values to .env)');
  }
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'biohelix/students',
        public_id: studentId.toLowerCase(),
        overwrite: true,
        invalidate: true,
        type: 'authenticated',
        resource_type: 'image',
        transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face', quality: 'auto', fetch_format: 'jpg' }],
      },
      (error, result) => {
        if (error) return reject(new HttpError(502, `Photo upload failed: ${error.message}`));
        resolve({ publicId: result.public_id, version: result.version });
      },
    );
    stream.end(buffer);
  }).then(async (photo) => {
    if (oldPublicId && oldPublicId !== photo.publicId) {
      await cloudinary.uploader.destroy(oldPublicId, { type: 'authenticated' }).catch(() => {});
    }
    return photo;
  });
}

/** Signed URL for an authenticated photo, or null. */
export function photoUrl(photo) {
  if (!cloudinaryEnabled || !photo?.publicId) return null;
  return cloudinary.url(photo.publicId, {
    type: 'authenticated',
    sign_url: true,
    secure: true,
    version: photo.version,
    format: 'jpg',
  });
}
