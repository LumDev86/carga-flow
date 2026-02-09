import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private supabase: SupabaseClient;
  private bucket: string;

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('SUPABASE_URL');
    const serviceKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    this.bucket = this.configService.get<string>('SUPABASE_STORAGE_BUCKET') || 'img';

    if (!url || !serviceKey || serviceKey === 'your-service-role-key') {
      this.logger.warn('Supabase Storage not configured - uploads will fail');
    }

    this.supabase = createClient(url || '', serviceKey || '');
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string,
  ): Promise<string> {
    const ext = file.originalname.split('.').pop() || 'jpg';
    const fileName = `${folder}/${uuidv4()}.${ext}`;

    const { error } = await this.supabase.storage
      .from(this.bucket)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      this.logger.error(`Upload failed: ${error.message}`);
      throw new Error(`Error al subir archivo: ${error.message}`);
    }

    const { data } = this.supabase.storage
      .from(this.bucket)
      .getPublicUrl(fileName);

    return data.publicUrl;
  }

  async deleteFile(publicUrl: string): Promise<void> {
    // Extract path from public URL
    const bucketPath = `storage/v1/object/public/${this.bucket}/`;
    const idx = publicUrl.indexOf(bucketPath);
    if (idx === -1) return;

    const filePath = publicUrl.substring(idx + bucketPath.length);

    const { error } = await this.supabase.storage
      .from(this.bucket)
      .remove([filePath]);

    if (error) {
      this.logger.error(`Delete failed: ${error.message}`);
    }
  }
}
