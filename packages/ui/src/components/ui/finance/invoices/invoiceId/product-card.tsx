import { Badge } from "@tuturuuu/ui/badge"
import { Card, CardContent } from "@tuturuuu/ui/card"
import { Box, Edit } from "@tuturuuu/ui/icons"
import Link from "next/link"

interface ProductCardProps {
    product: {
        product_name: string
        amount: number
        product_unit: string
        price: number
        product_id?: string | null
    }
    locale: string
    workspaceId?: string
}

export function ProductCard({ product, locale, workspaceId }: ProductCardProps) {
    const totalPrice = product.amount * product.price
    const isHighQuantity = product.amount > 10

    const cardContent = (
        <Card className="group bg-card border-border shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all duration-300 ease-in-out cursor-pointer">
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1">
                        <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors duration-200">
                            <Box className="h-5 w-5 text-primary group-hover:scale-110 transition-transform duration-200" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-card-foreground text-sm truncate group-hover:text-primary transition-colors duration-200">
                                {product.product_name}
                            </h4>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-muted-foreground">
                                    {product.amount} {product.product_unit}
                                </span>
                                {isHighQuantity && (
                                    <Badge variant="secondary" className="text-xs px-2 py-0.5 group-hover:bg-primary/20 transition-colors duration-200">
                                        Bulk
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="font-semibold text-sm text-card-foreground group-hover:text-primary transition-colors duration-200">
                            {Intl.NumberFormat(locale, {
                                style: "currency",
                                currency: "VND",
                            }).format(totalPrice)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {Intl.NumberFormat(locale, {
                                style: "currency",
                                currency: "VND",
                            }).format(product.price)}{" "}
                            each
                        </div>
                    </div>
                    {product.product_id && workspaceId && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 ml-2">
                            <div className="p-1.5 bg-primary/10 rounded-md group-hover:bg-primary/20 transition-colors duration-200">
                                <Edit className="h-4 w-4 text-primary" />
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )

    // If product has an ID and workspaceId, wrap in Link
    if (product.product_id && workspaceId) {
        return (
            <Link href={`/${workspaceId}/inventory/products/${product.product_id}`}>
                {cardContent}
            </Link>
        )
    }

    // Otherwise, return the card without link
    return cardContent
}
