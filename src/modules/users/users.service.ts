import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existingUser = await this.userRepository.findOne({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('El email ya está registrado');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user = this.userRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });

    return await this.userRepository.save(user);
  }

  async findAll(): Promise<User[]> {
    return await this.userRepository.find();
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.userRepository.findOne({ where: { email } });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    Object.assign(user, updateUserDto);
    return await this.userRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
  }

  async setEmailOtp(
    userId: string,
    otp: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.userRepository.update(userId, {
      emailOtp: otp,
      emailOtpExpires: expiresAt,
    });
  }

  async setPhoneOtp(
    userId: string,
    otp: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.userRepository.update(userId, {
      phoneOtp: otp,
      phoneOtpExpires: expiresAt,
    });
  }

  async verifyEmail(userId: string): Promise<void> {
    await this.userRepository.update(userId, {
      emailVerified: true,
      emailOtp: undefined,
      emailOtpExpires: undefined,
    });
  }

  async verifyPhone(userId: string): Promise<void> {
    await this.userRepository.update(userId, {
      phoneVerified: true,
      phoneOtp: undefined,
      phoneOtpExpires: undefined,
    });
  }

  async updatePushToken(userId: string, pushToken: string | null): Promise<void> {
    await this.userRepository.update(userId, { pushToken });
  }

  async removePushToken(userId: string): Promise<void> {
    await this.userRepository.update(userId, { pushToken: null });
  }

  async updateLocation(userId: string, updateLocationDto: UpdateLocationDto): Promise<User> {
    const user = await this.findOne(userId);

    user.latitude = updateLocationDto.latitude;
    user.longitude = updateLocationDto.longitude;
    user.address = updateLocationDto.address || null;

    return await this.userRepository.save(user);
  }
}
