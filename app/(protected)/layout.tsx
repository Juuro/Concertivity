import { getSession } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Header from "@/components/Header/header"
import Footer from "@/components/Footer/Footer"
import { getUserConcertCounts } from "@/lib/concerts/stats"
import { checkUserBan } from "@/lib/ban"

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession(await headers())

  if (!session?.user) {
    redirect("/login")
  }

  // Check if user is banned
  const banStatus = await checkUserBan(session.user.id)
  if (banStatus.banned) {
    redirect("/banned")
  }

  const userCounts = await getUserConcertCounts(session.user.id)

  return (
    <>
      <Header siteTitle="Concertivity" concertCounts={userCounts} />
      <main className="container">{children}</main>
      <Footer />
    </>
  )
}
