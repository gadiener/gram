import Model from "../data/models/Model.js";
import { RequestContext } from "../data/providers/RequestContext.js";
import { systemProvider } from "../data/systems/systems.js";
import { AuthzProvider } from "./AuthzProvider.js";
import { AllPermissions, Permission } from "./authorization.js";
import { Role } from "./models/Role.js";
import { UserToken } from "./models/UserToken.js";

export class DefaultAuthzProvider implements AuthzProvider {
  async getPermissionsForSystem(
    ctx: RequestContext,
    systemId: string,
    user: UserToken
  ): Promise<Permission[]> {
    if (user.roles.length === 0) return [];

    /**
     * Admins have full permission
     */
    if (user.roles.find((r) => r === Role.Admin)) return AllPermissions;

    const permissions: Permission[] = [];

    /**
     * Reviewers may review any model
     */
    if (user.roles.find((r) => r === Role.Reviewer)) {
      /**
       * TODO: give write permission only if reviewer is assigned to the model.
       */
      permissions.push(Permission.Read, Permission.Write, Permission.Review);
    }

    /**
     * Regular users may read any model
     */
    if (user.roles.find((r) => r === Role.User)) {
      permissions.push(Permission.Read);
    }

    /**
     * System owners, determined by team, may modify the model
     */
    const system = await systemProvider.getSystem(ctx, systemId);
    if (user.teams.find((t) => system?.owners?.find((o) => o.id === t.id))) {
      permissions.push(Permission.Write, Permission.Delete);
    }

    return permissions;
  }

  async getPermissionsForStandaloneModel(
    ctx: RequestContext,
    model: Model,
    user: UserToken
  ): Promise<Permission[]> {
    if (model.systemId) {
      return this.getPermissionsForSystem(ctx, model.systemId, user);
    }

    if (user.roles.length === 0) return [];

    if (user.roles.find((r) => r === Role.Admin)) return AllPermissions;

    /**
     * Standalone models are mainly used for training. To avoid authz issues here we allow most things
     * by most users. Ideally here there should be some sharing system.
     */

    const permissions: Permission[] = [];

    if (user.roles.find((r) => r === Role.Reviewer)) {
      permissions.push(Permission.Read, Permission.Review, Permission.Write);
    }

    if (user.roles.find((r) => r === Role.User)) {
      permissions.push(Permission.Read, Permission.Write);
    }

    if (model.createdBy === user.sub) {
      permissions.push(Permission.Read, Permission.Write, Permission.Delete);
    }

    return permissions;
  }

  async getRolesForUser(sub: string): Promise<Role[]> {
    return [Role.User];
  }

  key = "default";
}
