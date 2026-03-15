import { Global, Module } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UsersModule } from '../modules/users/users.module';

@Global()
@Module({
  imports: [UsersModule],
  providers: [JwtAuthGuard],
  exports: [JwtAuthGuard, UsersModule],
})
export class CommonModule {}
