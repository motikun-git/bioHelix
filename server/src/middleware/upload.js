import multer from 'multer';
import { HttpError } from '../utils/http.js';

const storage = multer.memoryStorage();

export const imageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|heic|heif)$/.test(file.mimetype)) return cb(null, true);
    cb(new HttpError(400, 'Photo must be a JPG, PNG, WEBP or HEIC image'));
  },
}).single('photo');

export const csvUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.csv$/i.test(file.originalname) || /csv|text\/plain|excel/.test(file.mimetype)) return cb(null, true);
    cb(new HttpError(400, 'Upload a .csv file (in Google Sheets: File → Download → CSV)'));
  },
}).single('file');
