import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Document } from './entities/document.entity';
import { DocumentVersion } from './entities/document-version.entity';
import { InlineComment } from './entities/inline-comment.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { User } from '../users/entities/user.entity';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { CreateDocumentVersionDto } from './dto/create-document-version.dto';
import { CreateInlineCommentDto } from './dto/create-inline-comment.dto';

@Injectable()
export class DocumentService {
  constructor(
    @InjectRepository(Document)
    private documentRepo: Repository<Document>,
    @InjectRepository(DocumentVersion)
    private versionRepo: Repository<DocumentVersion>,
    @InjectRepository(InlineComment)
    private commentRepo: Repository<InlineComment>,
    @InjectRepository(Workspace)
    private workspaceRepo: Repository<Workspace>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  async create(workspaceId: string, dto: CreateDocumentDto) {
    const workspace = await this.workspaceRepo.findOne({
      where: { workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const user = await this.userRepo.findOne({
      where: { userId: dto.createdById },
    });
    if (!user) throw new NotFoundException('User not found');

    const doc = this.documentRepo.create({
      title: dto.title,
      content: dto.content || '',
      workspace,
      createdBy: user,
      lastEditedBy: user,
    });

    return this.documentRepo.save(doc);
  }

  async findByWorkspace(workspaceId: string) {
    return this.documentRepo.find({
      where: { workspace: { workspaceId } },
      relations: ['createdBy', 'lastEditedBy'],
      order: { updatedAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const doc = await this.documentRepo.findOne({
      where: { documentId: id },
      relations: [
        'versions',
        'versions.editedBy',
        'comments',
        'comments.parentComment',
        'comments.author',
        'comments.replies',
        'comments.replies.author',
        'createdBy',
        'lastEditedBy',
      ],
    });
    if (!doc) throw new NotFoundException('Document not found');

    doc.viewCount += 1;
    await this.documentRepo.save(doc);

    doc.versions = (doc.versions ?? []).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    doc.comments = (doc.comments ?? [])
      .filter((comment) => !comment.parentComment)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return doc;
  }

  async update(id: string, dto: UpdateDocumentDto) {
    const doc = await this.documentRepo.findOne({
      where: { documentId: id },
      relations: ['createdBy', 'lastEditedBy'],
    });
    if (!doc) throw new NotFoundException('Document not found');

    if (dto.title !== undefined) doc.title = dto.title;
    if (dto.isFavorite !== undefined) doc.isFavorite = dto.isFavorite;

    if (dto.content !== undefined) {
      doc.content = dto.content;
    }

    const editorId = dto.lastEditedById ?? dto.createdById;
    if ((dto.title !== undefined || dto.content !== undefined) && editorId) {
      const editor = await this.userRepo.findOne({
        where: { userId: editorId },
      });
      if (editor) doc.lastEditedBy = editor;
    }

    return this.documentRepo.save(doc);
  }

  async remove(id: string) {
    const doc = await this.documentRepo.findOne({
      where: { documentId: id },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return this.documentRepo.remove(doc);
  }

  async createVersion(docId: string, dto: CreateDocumentVersionDto) {
    const doc = await this.documentRepo.findOne({
      where: { documentId: docId },
    });
    if (!doc) throw new NotFoundException('Document not found');

    const user = await this.userRepo.findOne({
      where: { userId: dto.editedById },
    });
    if (!user) throw new NotFoundException('User not found');

    const version = this.versionRepo.create({
      name: dto.name,
      content: dto.content,
      document: doc,
      editedBy: user,
    });

    return this.versionRepo.save(version);
  }

  async createComment(docId: string, dto: CreateInlineCommentDto) {
    const doc = await this.documentRepo.findOne({
      where: { documentId: docId },
    });
    if (!doc) throw new NotFoundException('Document not found');

    const author = await this.userRepo.findOne({
      where: { userId: dto.authorId },
    });
    if (!author) throw new NotFoundException('User not found');

    let parentComment: InlineComment | null = null;
    if (dto.parentCommentId) {
      parentComment = await this.commentRepo.findOne({
        where: { inlineCommentId: dto.parentCommentId },
      });
      if (!parentComment)
        throw new NotFoundException('Parent comment not found');
    }

    const comment = this.commentRepo.create({
      selectedText: dto.selectedText,
      text: dto.text,
      document: doc,
      author,
      parentComment,
    });

    return this.commentRepo.save(comment);
  }

  async resolveComment(commentId: string) {
    const comment = await this.commentRepo.findOne({
      where: { inlineCommentId: commentId },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    comment.isResolved = true;
    return this.commentRepo.save(comment);
  }
}
