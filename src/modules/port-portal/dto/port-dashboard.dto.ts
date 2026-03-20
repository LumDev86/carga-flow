export class PortDashboardDto {
  tripsToday: number;
  tripsThisWeek: number;
  tripsThisMonth: number;
  pendingUnloads: number;
  pendingCpes: number;
  arrivalsToday: number;
  departuresToday: number;
  demoradosToday: number;
  rechazadosToday: number;
}

export class PortStatsDto {
  tripsByMonth: { month: string; count: number }[];
  averageRatingGiven: number;
  topDrivers: { driverId: string; driverName: string; tripCount: number }[];
  cargoTypeBreakdown: { cargoType: string; count: number }[];
  avgDeliveryTimeHours: number;
}
