export const PERMISSIONS = [
  'invoices.view',
  'invoices.create',
  'invoices.edit',
  'invoices.send',
  'invoices.void',
  'invoices.mark_paid',
  'invoices.delete',
  'people.view',
  'people.manage',
  'settings.view',
  'settings.defaults',
  'settings.email',
  'settings.payments',
  'settings.branding',
  'settings.numbering',
  'settings.format',
  'users.view',
  'users.manage',
  'roles.manage',
  'companies.view',
  'companies.edit',
  'companies.create',
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const PERMISSION_GROUPS: {
  id: string
  label: string
  permissions: { id: Permission; label: string }[]
}[] = [
  {
    id: 'invoices',
    label: 'Invoices',
    permissions: [
      { id: 'invoices.view', label: 'View invoices' },
      { id: 'invoices.create', label: 'Create invoices' },
      { id: 'invoices.edit', label: 'Edit invoices' },
      { id: 'invoices.send', label: 'Send invoices' },
      { id: 'invoices.void', label: 'Void invoices' },
      { id: 'invoices.mark_paid', label: 'Mark invoices paid' },
      { id: 'invoices.delete', label: 'Delete draft invoices' },
    ],
  },
  {
    id: 'people',
    label: 'People',
    permissions: [
      { id: 'people.view', label: 'View people' },
      { id: 'people.manage', label: 'Add and edit people' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    permissions: [
      { id: 'settings.view', label: 'View settings' },
      { id: 'settings.defaults', label: 'Edit defaults' },
      { id: 'settings.email', label: 'Edit email / SMTP' },
      { id: 'settings.payments', label: 'Edit payments' },
      { id: 'settings.branding', label: 'Edit branding' },
      { id: 'settings.numbering', label: 'Edit numbering' },
      { id: 'settings.format', label: 'Edit format' },
    ],
  },
  {
    id: 'team',
    label: 'Team',
    permissions: [
      { id: 'users.view', label: 'View users' },
      { id: 'users.manage', label: 'Add and remove users' },
      { id: 'roles.manage', label: 'Create and edit roles' },
    ],
  },
  {
    id: 'company',
    label: 'Company',
    permissions: [
      { id: 'companies.view', label: 'View company' },
      { id: 'companies.edit', label: 'Rename company' },
      { id: 'companies.create', label: 'Create additional companies' },
    ],
  },
]

export const ALL_PERMISSIONS: Permission[] = [...PERMISSIONS]

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value)
}

export function normalizePermissions(values: unknown): Permission[] {
  if (!Array.isArray(values)) {
    return []
  }
  const unique = new Set<Permission>()
  for (const value of values) {
    if (typeof value === 'string' && isPermission(value)) {
      unique.add(value)
    }
  }
  return PERMISSIONS.filter((permission) => unique.has(permission))
}

export function hasPermission(
  granted: readonly string[] | undefined,
  permission: Permission,
): boolean {
  return Boolean(granted?.includes(permission))
}

export const PRESET_ROLES: { key: string; name: string; permissions: Permission[] }[] =
  [
    { key: 'owner', name: 'Owner', permissions: [...ALL_PERMISSIONS] },
    {
      key: 'admin',
      name: 'Administrator',
      permissions: ALL_PERMISSIONS.filter(
        (permission) => permission !== 'companies.create',
      ),
    },
    {
      key: 'invoicing',
      name: 'Invoicing',
      permissions: [
        'invoices.view',
        'invoices.create',
        'invoices.edit',
        'invoices.send',
        'invoices.delete',
        'people.view',
        'people.manage',
        'settings.view',
      ],
    },
    {
      key: 'bookkeeper',
      name: 'Bookkeeper',
      permissions: [
        'invoices.view',
        'invoices.mark_paid',
        'invoices.void',
        'people.view',
        'settings.view',
        'settings.payments',
      ],
    },
    {
      key: 'viewer',
      name: 'Viewer',
      permissions: [
        'invoices.view',
        'people.view',
        'settings.view',
        'users.view',
        'companies.view',
      ],
    },
  ]
