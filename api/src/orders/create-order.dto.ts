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

  // Only when signed out: a signed-in booking uses the account's email and profile name.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  clientName?: string;

  @IsOptional()
  @IsEmail()
  clientEmail?: string;

  @IsOptional()
  @IsTimeZone()
  clientTimezone?: string;
}
