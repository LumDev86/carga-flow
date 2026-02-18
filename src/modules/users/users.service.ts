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

  async findAllPaginated(filters: {
    page?: number;
    limit?: number;
    role?: string;
    status?: string;
    search?: string;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const skip = (page - 1) * limit;

    const qb = this.userRepository.createQueryBuilder('user');

    if (filters.role) {
      qb.andWhere('user.rol = :role', { role: filters.role });
    }

    if (filters.status) {
      qb.andWhere('user.estado = :status', { status: filters.status });
    }

    if (filters.search) {
      qb.andWhere(
        '(user.first_name ILIKE :search OR user.last_name ILIKE :search OR user.email ILIKE :search OR user.phone ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    qb.orderBy('user.created_at', 'DESC');
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
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
