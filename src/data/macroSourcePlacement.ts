import type { MacroCountryCode } from '../types';

export interface MacroSourcePlacement {
  bls: boolean;
  oecdCli: boolean;
  oecdCountry: boolean;
  eurostat: boolean;
}

export function getMacroSourcePlacement(countryCodes?: MacroCountryCode[]): MacroSourcePlacement {
  const isCompare = !countryCodes?.length;
  return {
    bls: !isCompare && countryCodes.includes('US'),
    oecdCli: isCompare,
    oecdCountry: !isCompare && countryCodes.length === 1,
    eurostat: !isCompare && countryCodes.includes('EA'),
  };
}
