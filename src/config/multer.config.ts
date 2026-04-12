import { memoryStorage, type StorageEngine } from 'multer';

type UploadedMulterFile = {
  mimetype: string;
};

export const multerConfig = {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  storage: (memoryStorage as unknown as () => StorageEngine)(),
  fileFilter: (
    _req: unknown,
    file: UploadedMulterFile,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
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
