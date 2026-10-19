import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
  MaxLength,
} from 'class-validator';

export const MAX_SESSIONS_PER_ORDER = 6;

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  consultantId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SESSIONS_PER_ORDER)
  @ArrayUnique()
  @IsISO8601({ strict: true }, { each: true })
  startsAt: string[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  clientName: string;

  @IsEmail()
  clientEmail: string;

  @IsOptional()
  @IsTimeZone()
  clientTimezone?: string;
}
