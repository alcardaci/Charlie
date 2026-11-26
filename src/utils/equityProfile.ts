import type { CompanyWorkbench, SecCompanyData } from '../types';

export function resolveEquityProfile(yahoo: CompanyWorkbench['profile'], sec?: SecCompanyData) {
  const registry = sec?.identity?.verified ? sec.profile : null;
  const supplied = new Set<string>();
  function field(yahooValue: string | undefined, filedValue: string | undefined, label: string) {
    if (yahooValue?.trim()) return yahooValue.trim();
    if (filedValue?.trim()) {
      supplied.add(label);
      return filedValue.trim();
    }
    return undefined;
  }
  // Keep the address components together when the providers list different offices.
  const samePlace = (a?: string, b?: string) => !a?.trim() || !b?.trim() || a.trim().toLowerCase() === b.trim().toLowerCase();
  const address = samePlace(yahoo.country, registry?.country) && samePlace(yahoo.city, registry?.city) ? registry : null;
  const profile = {
    ...yahoo,
    industry: field(yahoo.industry, registry?.industry, 'industry classification'),
    country: field(yahoo.country, address?.country, 'business address'),
    city: field(yahoo.city, address?.city, 'business address'),
    state: field(yahoo.state, address?.state, 'business address'),
    website: field(yahoo.website, registry?.website, 'website'),
  };
  return { profile, sourceFields: [...supplied], sourceUrl: registry?.sourceUrl };
}
