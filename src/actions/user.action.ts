'use server'

import { prisma } from '@/lib/prisma'
import { auth, currentUser } from '@clerk/nextjs/server'

export const asyncUser = async () => {
  try {
    const { userId } = await auth()
    const user = await currentUser()

    if (!userId || !user) return

    const existingUser = await prisma.user.findUnique({
      where: { clerkId: userId },
    })

    if (existingUser) {
      return existingUser
    }

    const dbUser = await prisma.user.create({
      data: {
        clerkId: userId,
        name: `${user.firstName || ''} ${user.lastName || ''}`,
        email: user.emailAddresses[0].emailAddress,
        username:
          user.username ?? user.emailAddresses[0].emailAddress.split('@')[0],
        image: user.imageUrl,
      },
    })

    return dbUser
  } catch (error) {
    console.error('Error in syncUser', error)
  }
}

export const getUserByClerkId = async (clerkId: string) => {
  try {
    return await prisma.user.findUnique({
      where: { clerkId },
      include: {
        _count: {
          select: {
            followers: true,
            following: true,
            posts: true,
          },
        },
      },
    })
  } catch (error) {
    console.log('Error in getUserByClerkId', error)
  }
}

export const getDbUserId = async () => {
  const { userId: clerkId } = await auth()
  if (!clerkId) return null

  const user = await getUserByClerkId(clerkId)

  if (!user) throw new Error('User not found')

  return user.id
}

export const getRandomUsers = async () => {
  try {
    const userId = await getDbUserId()

    if (!userId) return []

    const randomUsers = await prisma.user.findMany({
      where: {
        AND: [
          { NOT: { id: userId } },
          {
            NOT: {
              followers: {
                some: {
                  followerId: userId,
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        username: true,
        image: true,
        _count: {
          select: {
            followers: true,
          },
        },
      },
      take: 3,
    })

    return randomUsers
  } catch (error) {
    console.log('Error in getRandomUsers', error)
  }
}

export const toggleFollow = async (targerUserId: string) => {
  try {
    const userId = await getDbUserId()

    if (!userId) return

    if (userId === targerUserId) throw new Error('You cannot follow yourself')

    const existingFollow = await prisma.follows.findUnique({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId: targerUserId,
        },
      },
    })

    if (existingFollow) {
      await prisma.follows.delete({
        where: {
          followerId_followingId: {
            followerId: userId,
            followingId: targerUserId,
          },
        },
      })
    } else {
      await prisma.$transaction([
        prisma.follows.create({
          data: {
            followerId: userId,
            followingId: targerUserId,
          },
        }),

        prisma.notification.create({
          data: {
            type: 'FOLLOW',
            userId: targerUserId,
            creatorId: userId,
          },
        }),
      ])
    }

    return { success: true }
  } catch (error) {
    console.log(error)
  }
}
