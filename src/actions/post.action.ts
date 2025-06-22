'use server'

import { prisma } from '@/lib/prisma'
import { getDbUserId } from './user.action'
import { revalidatePath } from 'next/cache'

export const getPosts = async () => {
  try {
    const posts = await prisma.post.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
            username: true,
          },
        },
        comments: {
          select: {
            id: true,
            content: true,
            createdAt: true,
            author: {
              select: {
                id: true,
                name: true,
                image: true,
                username: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        likes: {
          select: {
            userId: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    })

    return posts
  } catch (error) {
    console.log('Error in getPosts', error)
  }
}

export const createPost = async (content: string, image: string) => {
  try {
    const userId = await getDbUserId()

    if (!userId) return

    const post = await prisma.post.create({
      data: {
        content,
        image,
        authorId: userId,
      },
    })

    revalidatePath('/')
    return { success: true, post }
  } catch (error) {
    console.log('Error in createPost', error)
  }
}

export const toggleLike = async (postId: string) => {
  try {
    const userId = await getDbUserId()
    if (!userId) return

    // check if like exists
    const existingLike = await prisma.like.findUnique({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
    })

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    })

    if (!post) throw new Error('Post not found')

    if (existingLike) {
      // unlike
      await prisma.like.delete({
        where: {
          userId_postId: {
            userId,
            postId,
          },
        },
      })
    } else {
      // like and create notification (only if liking someone else's post)
      await prisma.$transaction([
        prisma.like.create({
          data: {
            userId,
            postId,
          },
        }),
        ...(post.authorId !== userId
          ? [
              prisma.notification.create({
                data: {
                  type: 'LIKE',
                  userId: post.authorId, // recipient (post author)
                  creatorId: userId, // person who liked
                  postId,
                },
              }),
            ]
          : []),
      ])
    }

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Failed to toggle like:', error)
    return { success: false, error: 'Failed to toggle like' }
  }
}

export const createComment = async (postId: string, content: string) => {
  try {
    const userId = await getDbUserId()

    if (!userId) return
    if (!content) throw new Error('Content is required')

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    })

    if (!post) throw new Error('Post not found')

    const [comment] = await prisma.$transaction(async (tx) => {
      const newComment = await tx.comment.create({
        data: {
          content,
          postId,
          authorId: userId,
        },
      })

      if (post.authorId !== userId) {
        await tx.notification.create({
          data: {
            type: 'COMMENT',
            userId: post.authorId,
            creatorId: userId,
            postId,
            commentId: newComment.id,
          },
        })
      }
      return [newComment]
    })

    revalidatePath(`/`)
    return { success: true, comment }
  } catch (error) {
    console.log('Error in createComment', error)
  }
}

export const deletePost = async (postId: string) => {
  try {
    const userId = await getDbUserId()

    if (!userId) return

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    })

    if (!post) throw new Error('Post not found')

    if (post.authorId !== userId)
      throw new Error('Unauthorized - no delete permission')

    await prisma.post.delete({
      where: { id: postId },
    })

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.log('Error in deletePost', error)
    return { success: true, error: 'Fieled to delete post' }
  }
}
