import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class File {
  @PrimaryGeneratedColumn('uuid')
  fileId: string;

  @Column()
  fileName: string;

  @Column()
  fileUrl: string;

  @Column()
  fileType: string;

  @Column()
  fileSize: number;

  @Column()
  uploadAt: Date;

  @Column()
  folderPath: string;

  @Column()
  bucketName: string;

  @Column()
  region: string;
}
