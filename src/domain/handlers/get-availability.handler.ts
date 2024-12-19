import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import {
  ClubWithAvailability,
  GetAvailabilityQuery,
} from '../commands/get-availaiblity.query';
import {
  ALQUILA_TU_CANCHA_CLIENT,
  AlquilaTuCanchaClient,
} from '../ports/aquila-tu-cancha.client';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@QueryHandler(GetAvailabilityQuery)
export class GetAvailabilityHandler
  implements IQueryHandler<GetAvailabilityQuery>
{
  constructor(
    // @ts-ignore
    @Inject(ALQUILA_TU_CANCHA_CLIENT)
    private alquilaTuCanchaClient: AlquilaTuCanchaClient,
    // @ts-ignore
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async execute(query: GetAvailabilityQuery): Promise<ClubWithAvailability[]> {
    const cacheKey = `availability-${query.placeId}-${query.date}`;
    const cachedData: ClubWithAvailability[] | undefined =
      await this.cacheManager.get(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    
    const clubs = await this.alquilaTuCanchaClient.getClubs(query.placeId);
    console.log('inicio');
    const clubsWithAvailability: ClubWithAvailability[] = await Promise.all(
      clubs.map(async (club) => {
        
        const courts = await this.alquilaTuCanchaClient.getCourts(club.id);

        
        const courtsWithAvailability = await Promise.all(
          courts.map(async (court) => {
            const slots = await this.alquilaTuCanchaClient.getAvailableSlots(
              club.id,
              court.id,
              query.date,
            );
            return { ...court, available: slots };
          }),
        );

        return { ...club, courts: courtsWithAvailability };
      }),
    );
    console.log('fin');

    // Almacenar en caché la respuesta con un TTL de 15 seg
    await this.cacheManager.set(cacheKey, clubsWithAvailability, 15000);
    return clubsWithAvailability;
  }
}
