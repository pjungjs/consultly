import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class WeeklyHoursDto {
  @IsInt()
  @Min(1)
  @Max(7)
  weekday: number; // 1 = Monday ... 7 = Sunday

  @Matches(HHMM, { message: 'startTime must look like 09:00' })
  startTime: string;

  @Matches(HHMM, { message: 'endTime must look like 17:00' })
  endTime: string;
}

export class SaveHoursDto {
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => WeeklyHoursDto)
  weekly: WeeklyHoursDto[];
}

export class AddTimeOffDto {
  @IsISO8601({ strict: true })
  from: string; // "2026-10-27", a date in the consultant's own zone

  @IsISO8601({ strict: true })
  to: string; // inclusive

  @IsOptional()
  @IsString()
  @MaxLength(80)
  note?: string;
}
