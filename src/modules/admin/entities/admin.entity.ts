import { Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Report } from 'src/modules/reports/entities/reports.entity';
@Entity()
export class Admin {
  @PrimaryGeneratedColumn('uuid')
  adminId: string;

  @OneToMany(() => Report, (report) => report.admin)
  reports: Report[];
}
