import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { TripsService } from '../trips.service';

@Processor('trips')
export class AssignmentProcessor {
  private readonly logger = new Logger(AssignmentProcessor.name);

  constructor(private readonly tripsService: TripsService) {}

  @Process('assignment-timeout')
  async handleAssignmentTimeout(job: Job<{ tripId: string }>) {
    this.logger.log(`Processing assignment timeout for trip ${job.data.tripId}`);
    await this.tripsService.broadcastTrip(job.data.tripId);
  }
}
