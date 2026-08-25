export type PersonRecord = {
  id: string
  name: string
  email: string
  address: {
    line1: string
    line2: string
    city: string
    region: string
    postalCode: string
    country: string
  }
  createdAt: string
  updatedAt: string
}

export type PersonWriteFields = Omit<PersonRecord, 'id' | 'createdAt' | 'updatedAt'>

export interface DirectoryStore {
  listPeople(): Promise<PersonRecord[]>
  getPerson(id: string): Promise<PersonRecord | null>
  createPerson(record: PersonRecord): Promise<PersonRecord>
  updatePerson(
    id: string,
    fields: PersonWriteFields,
    updatedAt: string,
  ): Promise<PersonRecord | null>
  deletePerson(id: string): Promise<boolean>
  getDefaultFromId(): Promise<string | null>
  setDefaultFromId(id: string | null, updatedAt: string): Promise<void>
}

export const DEFAULT_FROM_SETTING_KEY = 'default_from_person_id'
