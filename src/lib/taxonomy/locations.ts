export interface CountryOption {
  id: string;
  label: string;
  /** Whether we have a state dropdown for this country; if false, State is free text. */
  hasStates: boolean;
}

export const COUNTRIES: CountryOption[] = [
  { id: "US", label: "United States", hasStates: true },
  { id: "CA", label: "Canada", hasStates: false },
  { id: "GB", label: "United Kingdom", hasStates: false },
  { id: "AU", label: "Australia", hasStates: false },
  { id: "GLOBAL", label: "Global / not location-specific", hasStates: false },
];

export const COUNTRYWIDE_STATE_ID = "COUNTRYWIDE";

export const US_STATES: { id: string; label: string }[] = [
  { id: "AL", label: "Alabama" },
  { id: "AK", label: "Alaska" },
  { id: "AZ", label: "Arizona" },
  { id: "AR", label: "Arkansas" },
  { id: "CA", label: "California" },
  { id: "CO", label: "Colorado" },
  { id: "CT", label: "Connecticut" },
  { id: "DE", label: "Delaware" },
  { id: "DC", label: "District of Columbia" },
  { id: "FL", label: "Florida" },
  { id: "GA", label: "Georgia" },
  { id: "HI", label: "Hawaii" },
  { id: "ID", label: "Idaho" },
  { id: "IL", label: "Illinois" },
  { id: "IN", label: "Indiana" },
  { id: "IA", label: "Iowa" },
  { id: "KS", label: "Kansas" },
  { id: "KY", label: "Kentucky" },
  { id: "LA", label: "Louisiana" },
  { id: "ME", label: "Maine" },
  { id: "MD", label: "Maryland" },
  { id: "MA", label: "Massachusetts" },
  { id: "MI", label: "Michigan" },
  { id: "MN", label: "Minnesota" },
  { id: "MS", label: "Mississippi" },
  { id: "MO", label: "Missouri" },
  { id: "MT", label: "Montana" },
  { id: "NE", label: "Nebraska" },
  { id: "NV", label: "Nevada" },
  { id: "NH", label: "New Hampshire" },
  { id: "NJ", label: "New Jersey" },
  { id: "NM", label: "New Mexico" },
  { id: "NY", label: "New York" },
  { id: "NC", label: "North Carolina" },
  { id: "ND", label: "North Dakota" },
  { id: "OH", label: "Ohio" },
  { id: "OK", label: "Oklahoma" },
  { id: "OR", label: "Oregon" },
  { id: "PA", label: "Pennsylvania" },
  { id: "RI", label: "Rhode Island" },
  { id: "SC", label: "South Carolina" },
  { id: "SD", label: "South Dakota" },
  { id: "TN", label: "Tennessee" },
  { id: "TX", label: "Texas" },
  { id: "UT", label: "Utah" },
  { id: "VT", label: "Vermont" },
  { id: "VA", label: "Virginia" },
  { id: "WA", label: "Washington" },
  { id: "WV", label: "West Virginia" },
  { id: "WI", label: "Wisconsin" },
  { id: "WY", label: "Wyoming" },
];

/** Not exhaustive — just enough for a helpful autocomplete on the City field. */
export const MAJOR_US_CITIES: string[] = [
  "New York",
  "Los Angeles",
  "Chicago",
  "Houston",
  "Phoenix",
  "Philadelphia",
  "San Antonio",
  "San Diego",
  "Dallas",
  "Austin",
  "Jacksonville",
  "Fort Worth",
  "Columbus",
  "Charlotte",
  "San Francisco",
  "Indianapolis",
  "Seattle",
  "Denver",
  "Washington",
  "Boston",
  "Nashville",
  "Baltimore",
  "Portland",
  "Las Vegas",
  "Detroit",
  "Memphis",
  "Louisville",
  "Milwaukee",
  "Albuquerque",
  "Tucson",
  "Fresno",
  "Sacramento",
  "Kansas City",
  "Atlanta",
  "Miami",
  "Omaha",
  "Raleigh",
  "Colorado Springs",
  "Long Beach",
  "Virginia Beach",
  "Oakland",
  "Minneapolis",
  "Tulsa",
  "Tampa",
  "Arlington",
  "New Orleans",
];

export function countryLabel(id: string): string {
  return COUNTRIES.find((c) => c.id === id)?.label ?? id;
}

export function isCountrywideState(stateId: string): boolean {
  return stateId === COUNTRYWIDE_STATE_ID;
}

export function stateLabel(id: string): string {
  if (isCountrywideState(id)) return "";
  return US_STATES.find((s) => s.id === id)?.label ?? id;
}
