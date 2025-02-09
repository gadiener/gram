import { DefaultAuthzProvider } from "@gram/core/dist/auth/DefaultAuthzProvider.js";
import { Role } from "@gram/core/dist/auth/models/Role.js";

export class StaticAuthzProvider extends DefaultAuthzProvider {
  key: string = "static";
  constructor(
    public users: string[],
    public reviewers: string[],
    public admins: string[]
  ) {
    super();
  }

  async getRolesForUser(sub: string): Promise<Role[]> {
    const roles: Role[] = [];

    if (this.admins.includes(sub)) {
      roles.push(Role.Admin);
    }
    if (this.reviewers.includes(sub)) {
      roles.push(Role.Reviewer);
    }
    if (this.users.includes(sub)) {
      roles.push(Role.User);
    }

    return roles;
  }
}
