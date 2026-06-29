<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    protected $connection = 'pgsql_owner';

    public function up(): void
    {
        // Drop dependent view first
        DB::statement('DROP VIEW IF EXISTS v_low_stock_alerts');
        DB::statement('DROP VIEW IF EXISTS v_expiry_alerts');
        DB::statement('DROP VIEW IF EXISTS v_current_stock');

        // Recreate with security_invoker=true so RLS is enforced as the querying role
        DB::statement('
            CREATE VIEW v_current_stock
            WITH (security_invoker = true) AS
            SELECT
                p.id              AS product_id,
                p.name            AS product_name,
                p.sku,
                p.unit,
                p.latest_cost,
                p.wholesale_price,
                p.retail_price,
                p.wholesale_threshold,
                l.id              AS location_id,
                l.name            AS location_name,
                l.type            AS location_type,
                COALESCE(SUM(sm.quantity), 0)::INTEGER AS current_stock
            FROM products p
            CROSS JOIN locations l
            LEFT JOIN stock_movements sm
                ON sm.product_id = p.id AND sm.location_id = l.id
            WHERE p.is_active = true AND l.is_active = true
            GROUP BY p.id, p.name, p.sku, p.unit, p.latest_cost,
                     p.wholesale_price, p.retail_price, p.wholesale_threshold,
                     l.id, l.name, l.type;
        ');

        DB::statement("
            CREATE VIEW v_expiry_alerts
            WITH (security_invoker = true) AS
            SELECT
                b.id             AS batch_id,
                b.product_id,
                p.name           AS product_name,
                b.batch_number,
                b.expiry_date,
                (b.expiry_date - CURRENT_DATE)::INTEGER AS days_until_expiry
            FROM batches b
            JOIN products p ON p.id = b.product_id
            WHERE b.expiry_date IS NOT NULL
              AND b.expiry_date > CURRENT_DATE
              AND b.expiry_date <= CURRENT_DATE + INTERVAL '60 days'
              AND p.is_active = true;
        ");

        DB::statement('
            CREATE VIEW v_low_stock_alerts
            WITH (security_invoker = true) AS
            WITH avg_sales AS (
                SELECT
                    si.product_id,
                    s.location_id,
                    SUM(si.quantity)::DECIMAL / 90 AS avg_daily
                FROM sale_items si
                JOIN sales s ON s.id = si.sale_id
                WHERE s.sale_date >= CURRENT_DATE - 90
                  AND s.is_reverted = false
                GROUP BY si.product_id, s.location_id
            )
            SELECT
                cs.product_id,
                cs.product_name,
                cs.location_id,
                cs.location_name,
                cs.location_type,
                cs.current_stock,
                ROUND(COALESCE(av.avg_daily, 0), 2) AS avg_daily_sales,
                CASE
                    WHEN COALESCE(av.avg_daily, 0) = 0 THEN NULL
                    ELSE (cs.current_stock / av.avg_daily)::INTEGER
                END AS days_of_cover
            FROM v_current_stock cs
            LEFT JOIN avg_sales av
                ON av.product_id = cs.product_id AND av.location_id = cs.location_id
            WHERE COALESCE(av.avg_daily, 0) > 0
              AND (cs.current_stock / av.avg_daily) <= 30;
        ');
    }

    public function down(): void
    {
        DB::statement('DROP VIEW IF EXISTS v_low_stock_alerts');
        DB::statement('DROP VIEW IF EXISTS v_expiry_alerts');
        DB::statement('DROP VIEW IF EXISTS v_current_stock');
        // Note: views without security_invoker are recreated by the previous create_stock_views migration
    }
};
