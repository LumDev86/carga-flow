import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Port } from './entities/port.entity';
import { CreatePortDto } from './dto/create-port.dto';
import { UpdatePortDto } from './dto/update-port.dto';

const PORTS_CACHE_KEY = 'ports:active';
const PORTS_CACHE_TTL = 300; // 5 minutes

@Injectable()
export class PortsService {
  private readonly logger = new Logger(PortsService.name);

  constructor(
    @InjectRepository(Port)
    private readonly portRepository: Repository<Port>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async getActivePorts(): Promise<Port[]> {
    const cached = await this.cacheManager.get<Port[]>(PORTS_CACHE_KEY);
    if (cached) return cached;

    const ports = await this.portRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });

    await this.cacheManager.set(PORTS_CACHE_KEY, ports, PORTS_CACHE_TTL);
    return ports;
  }

  async getAllPorts(): Promise<Port[]> {
    return this.portRepository.find({ order: { name: 'ASC' } });
  }

  async getPortById(id: string): Promise<Port> {
    const port = await this.portRepository.findOne({ where: { id } });
    if (!port) {
      throw new NotFoundException(`Puerto con id ${id} no encontrado`);
    }
    return port;
  }

  async createPort(dto: CreatePortDto): Promise<Port> {
    const port = this.portRepository.create({
      ...dto,
      portType: dto.portType || 'DESCARGA',
    });

    const saved = await this.portRepository.save(port);
    await this.invalidateCache();
    this.logger.log(`Puerto creado: ${saved.name} (${saved.id})`);
    return saved;
  }

  async updatePort(id: string, dto: UpdatePortDto): Promise<Port> {
    const port = await this.getPortById(id);
    Object.assign(port, dto);

    const saved = await this.portRepository.save(port);
    await this.invalidateCache();
    this.logger.log(`Puerto actualizado: ${saved.name} (${saved.id})`);
    return saved;
  }

  async deletePort(id: string): Promise<void> {
    const port = await this.getPortById(id);
    await this.portRepository.remove(port);
    await this.invalidateCache();
    this.logger.log(`Puerto eliminado: ${port.name} (${id})`);
  }

  async toggleActive(id: string): Promise<Port> {
    const port = await this.getPortById(id);
    port.isActive = !port.isActive;
    const saved = await this.portRepository.save(port);
    await this.invalidateCache();
    return saved;
  }

  private async invalidateCache(): Promise<void> {
    await this.cacheManager.del(PORTS_CACHE_KEY);
  }
}
