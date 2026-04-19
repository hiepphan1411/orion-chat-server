import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { JwtPayload } from 'jsonwebtoken';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ChatGateway } from '../message/chat.gateway';
import { GroupManagementService } from './group-management.service';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupManagementController {
  constructor(
    private readonly groupManagementService: GroupManagementService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Patch(':groupId/settings/join-approval')
  async updateJoinApprovalSetting(
    @Param('groupId') groupId: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { joinRequireApproval: boolean },
  ) {
    const result = await this.groupManagementService.updateJoinApprovalSetting(
      groupId,
      user.userId,
      !!body?.joinRequireApproval,
    );

    this.chatGateway.emitGroupJoinApprovalSettingUpdated({
      groupId,
      joinRequireApproval: result.joinRequireApproval,
      updatedBy: result.updatedBy,
      updatedAt: result.updatedAt,
    });

    return result;
  }

  @Get(':groupId')
  async getGroupDetail(
    @Param('groupId') groupId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.groupManagementService.getGroupDetail(groupId, user.userId);
  }

  @Post(':groupId/join')
  async joinGroup(
    @Param('groupId') groupId: string,
    @CurrentUser() user: JwtPayload,
    @Body() body?: { message?: string },
  ) {
    const result = await this.groupManagementService.joinGroup(
      groupId,
      user.userId,
      body?.message,
    );

    if (result.status === 'joined') {
      this.chatGateway.emitGroupMemberJoined({
        groupId,
        userId: user.userId,
        joinedAt: new Date().toISOString(),
      });
    }

    if (result.status === 'pending_approval' && result.requestId) {
      this.chatGateway.emitGroupJoinRequestCreated({
        groupId,
        requestId: result.requestId,
        requesterId: user.userId,
        createdAt: new Date().toISOString(),
      });
    }

    return result;
  }

  // ============================================================================
  // 1. JOIN REQUEST MANAGEMENT
  // ============================================================================

  /**
   * Approve a join request for the group
   * @route POST /groups/:groupId/join-requests/:requestId/approve
   * @requires Role: Admin / Owner
   */
  @Post(':groupId/join-requests/:requestId/approve')
  async approveJoinRequest(
    @Param('groupId') groupId: string,
    @Param('requestId') requestId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.groupManagementService.approveJoinRequest(
      groupId,
      requestId,
      user.userId,
    );

    this.chatGateway.emitGroupJoinRequestUpdated({
      groupId,
      requestId,
      status: 'approved',
      actedBy: user.userId,
      actedAt: new Date().toISOString(),
      requesterId: result.member.userId,
    });

    this.chatGateway.emitGroupMemberJoined({
      groupId,
      userId: result.member.userId,
      joinedAt: new Date().toISOString(),
    });

    return result;
  }

  /**
   * Reject a join request for the group
   * @route POST /groups/:groupId/join-requests/:requestId/reject
   * @requires Role: Admin / Owner
   */
  @Post(':groupId/join-requests/:requestId/reject')
  async rejectJoinRequest(
    @Param('groupId') groupId: string,
    @Param('requestId') requestId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.groupManagementService.rejectJoinRequest(
      groupId,
      requestId,
      user.userId,
    );

    this.chatGateway.emitGroupJoinRequestUpdated({
      groupId,
      requestId,
      status: 'rejected',
      actedBy: user.userId,
      actedAt: new Date().toISOString(),
      requesterId: result.requesterId,
    });

    return result;
  }

  /**
   * Get all pending join requests (for group admins)
   * @route GET /groups/:groupId/join-requests
   * @requires Role: Admin / Owner
   */
  @Get(':groupId/join-requests')
  async getJoinRequests(
    @Param('groupId') groupId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.groupManagementService.getJoinRequests(groupId, user.userId);
  }

  /**
   * Create a join request to a group
   * @route POST /groups/:groupId/join-requests
   * @body { message?: string }
   */
  @Post(':groupId/join-requests')
  async createJoinRequest(
    @Param('groupId') groupId: string,
    @CurrentUser() user: JwtPayload,
    @Body() body?: { message?: string },
  ) {
    return this.groupManagementService.createJoinRequest(
      groupId,
      user.userId,
      body?.message,
    );
  }

  // ============================================================================
  // 2. MEMBER MANAGEMENT - PROMOTE
  // ============================================================================

  /**
   * Promote member to Deputy role
   * @route POST /groups/:groupId/members/:userId/promote
   * @requires Role: Admin / Owner
   */
  @Post(':groupId/members/:userId/promote')
  async promoteToAdmin(
    @Param('groupId') groupId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.groupManagementService.promoteToAdmin(
      groupId,
      targetUserId,
      user.userId,
    );
  }

  // ============================================================================
  // 3. MEMBER MANAGEMENT - REMOVE
  // ============================================================================

  /**
   * Remove member from group
   * @route DELETE /groups/:groupId/members/:userId
   * @requires Role: Admin / Owner
   * @note Cannot remove self or the owner (as co-admin)
   */
  @Delete(':groupId/members/:userId')
  async removeMember(
    @Param('groupId') groupId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.groupManagementService.removeMember(
      groupId,
      targetUserId,
      user.userId,
    );
  }

  // ============================================================================
  // 4. LEAVE GROUP
  // ============================================================================

  /**
   * Leave a group
   * @route POST /groups/:groupId/leave
   * @requires Any member
   * @note Owner cannot leave without another admin present
   */
  @Post(':groupId/leave')
  async leaveGroup(
    @Param('groupId') groupId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.groupManagementService.leaveGroup(groupId, user.userId);
  }

  // ============================================================================
  // 5. DISBAND GROUP
  // ============================================================================

  /**
   * Disband / Delete group (soft delete)
   * @route DELETE /groups/:groupId
   * @requires Role: Owner only
   * @effect Marks group as dissolved, removes all members
   */
  @Delete(':groupId')
  async disbandGroup(
    @Param('groupId') groupId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.groupManagementService.disbandGroup(groupId, user.userId);
  }
}
