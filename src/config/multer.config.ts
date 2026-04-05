import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';

const uploadDir = 'uploads';

// Tạo thư mục uploads nếu chưa tồn tại
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

if (!existsSync('uploads/avatars')) {
  mkdirSync('uploads/avatars', { recursive: true });
}

if (!existsSync('uploads/covers')) {
  mkdirSync('uploads/covers', { recursive: true });
}

export const multerConfig = {
  storage: diskStorage({
    destination: (req, file, cb) => {
      if (file.fieldname === 'avatar') {
        cb(null, 'uploads/avatars');
      } else if (file.fieldname === 'cover') {
        cb(null, 'uploads/covers');
      } else {
        cb(null, 'uploads');
      }
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = extname(file.originalname);
      const name = file.originalname.replace(ext, '');
      cb(null, `${name}-${uniqueSuffix}${ext}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    // Chỉ cho phép hình ảnh
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
};
