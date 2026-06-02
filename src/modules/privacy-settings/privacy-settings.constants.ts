export enum ProfileVisibility {
  PUBLIC = 'public',
  FRIENDS = 'friends',
  PRIVATE = 'private',
}

export enum ContactPermission {
  EVERYONE = 'everyone',
  FRIENDS = 'friends',
  NOBODY = 'nobody',
}

export type ViewerRelationship = 'self' | 'friend' | 'blocked' | 'stranger';

export const normalizeContactPermission = (
  value?: string | null,
): ContactPermission => {
  if (value === 'none') {
    return ContactPermission.NOBODY;
  }

  if (
    value === ContactPermission.EVERYONE ||
    value === ContactPermission.FRIENDS ||
    value === ContactPermission.NOBODY
  ) {
    return value;
  }

  return ContactPermission.FRIENDS;
};

export const normalizeProfileVisibility = (
  value?: string | null,
): ProfileVisibility => {
  if (
    value === ProfileVisibility.PUBLIC ||
    value === ProfileVisibility.FRIENDS ||
    value === ProfileVisibility.PRIVATE
  ) {
    return value;
  }

  return ProfileVisibility.FRIENDS;
};
