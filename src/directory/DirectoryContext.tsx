import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  createPerson,
  deletePerson,
  fetchPeople,
  fetchSettings,
  updatePerson,
  updateSettings,
} from '../api/directory.ts'
import { ApiError } from '../api/http.ts'
import type { Person, PersonInput } from '../types/person.ts'

type DirectoryContextValue = {
  people: Person[]
  defaultFromId: string | null
  loading: boolean
  saving: boolean
  error: string | null
  addPerson: (input: PersonInput) => Promise<Person>
  updatePerson: (id: string, input: PersonInput) => Promise<Person>
  removePerson: (id: string) => Promise<void>
  setDefaultFromId: (id: string | null) => Promise<void>
  getPerson: (id: string) => Person | undefined
  refresh: () => Promise<void>
}

const DirectoryContext = createContext<DirectoryContextValue | null>(null)

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Something went wrong. Please try again.'
}

function sortPeople(people: Person[]): Person[] {
  return [...people].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )
}

function clearLegacyLocalStorage(): void {
  try {
    localStorage.removeItem('bitz-designs-people')
    localStorage.removeItem('bitz-designs-settings')
  } catch {
    // Ignore storage failures.
  }
}

export function DirectoryProvider({ children }: { children: ReactNode }) {
  const [people, setPeople] = useState<Person[]>([])
  const [defaultFromId, setDefaultFromIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [nextPeople, settings] = await Promise.all([
        fetchPeople(),
        fetchSettings(),
      ])
      setPeople(sortPeople(nextPeople))
      setDefaultFromIdState(settings.defaultFromId)
    } catch (caught: unknown) {
      if (caught instanceof ApiError && caught.status === 403) {
        setPeople([])
        return
      }
      throw caught
    }
  }, [])

  useEffect(() => {
    clearLegacyLocalStorage()
    let cancelled = false
    setLoading(true)
    refresh()
      .then(() => {
        if (!cancelled) {
          setError(null)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(errorMessage(caught))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [refresh])

  const runMutation = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    setSaving(true)
    setError(null)
    try {
      return await action()
    } catch (caught) {
      const message = errorMessage(caught)
      setError(message)
      throw new Error(message, { cause: caught })
    } finally {
      setSaving(false)
    }
  }, [])

  const addPerson = useCallback(
    (input: PersonInput) =>
      runMutation(async () => {
        const person = await createPerson(input)
        setPeople((current) => sortPeople([...current, person]))
        return person
      }),
    [runMutation],
  )

  const updatePersonRecord = useCallback(
    (id: string, input: PersonInput) =>
      runMutation(async () => {
        const person = await updatePerson(id, input)
        setPeople((current) =>
          sortPeople(
            current.map((entry) => (entry.id === id ? person : entry)),
          ),
        )
        return person
      }),
    [runMutation],
  )

  const removePerson = useCallback(
    (id: string) =>
      runMutation(async () => {
        await deletePerson(id)
        setPeople((current) => current.filter((entry) => entry.id !== id))
        setDefaultFromIdState((current) => (current === id ? null : current))
      }),
    [runMutation],
  )

  const setDefaultFromId = useCallback(
    (id: string | null) =>
      runMutation(async () => {
        const settings = await updateSettings(id)
        setDefaultFromIdState(settings.defaultFromId)
      }),
    [runMutation],
  )

  const getPerson = useCallback(
    (id: string) => people.find((person) => person.id === id),
    [people],
  )

  const value = useMemo(
    () => ({
      people,
      defaultFromId,
      loading,
      saving,
      error,
      addPerson,
      updatePerson: updatePersonRecord,
      removePerson,
      setDefaultFromId,
      getPerson,
      refresh,
    }),
    [
      people,
      defaultFromId,
      loading,
      saving,
      error,
      addPerson,
      updatePersonRecord,
      removePerson,
      setDefaultFromId,
      getPerson,
      refresh,
    ],
  )

  return (
    <DirectoryContext.Provider value={value}>
      {children}
    </DirectoryContext.Provider>
  )
}

export function useDirectory(): DirectoryContextValue {
  const context = useContext(DirectoryContext)
  if (!context) {
    throw new Error('useDirectory must be used within DirectoryProvider')
  }
  return context
}
