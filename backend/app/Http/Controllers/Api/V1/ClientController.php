<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreClientRequest;
use App\Http\Requests\Api\V1\UpdateClientRequest;
use App\Models\Client;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ClientController extends Controller
{
    private const FIELDS = ['id', 'location_id', 'name', 'phone', 'notes', 'is_active'];

    // Correlated subquery: date of client's most recent non-reverted sale
    private const LAST_SALE_DATE_SQL = <<<'SQL'
        (SELECT sale_date::date FROM sales
         WHERE client_id = clients.id AND is_reverted = false
         ORDER BY sale_date DESC, id DESC LIMIT 1)
        SQL;

    // Correlated subquery: comma-separated product names from that last sale
    private const LAST_PRODUCTS_SQL = <<<'SQL'
        (SELECT string_agg(p.name, ', ' ORDER BY p.name)
         FROM sale_items si
         JOIN products p ON p.id = si.product_id
         WHERE si.sale_id = (
             SELECT id FROM sales
             WHERE client_id = clients.id AND is_reverted = false
             ORDER BY sale_date DESC, id DESC LIMIT 1
         ))
        SQL;

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Client::class);

        $query = Client::with('location')
            ->addSelect('clients.*')
            ->addSelect(DB::raw(self::LAST_SALE_DATE_SQL . ' AS last_purchase_date'))
            ->addSelect(DB::raw(self::LAST_PRODUCTS_SQL . ' AS last_products'))
            ->orderBy('name');

        if ($request->filled('location_id')) {
            $query->where('location_id', $request->integer('location_id'));
        }

        if ($request->filled('search')) {
            $term = '%' . $request->string('search') . '%';
            $query->where(fn ($q) => $q->where('name', 'ilike', $term)->orWhere('phone', 'ilike', $term));
        }

        // follow_up=true → clients whose last purchase was ≥ 7 days ago (or never purchased)
        if ($request->boolean('follow_up')) {
            $query->whereRaw(
                self::LAST_SALE_DATE_SQL . ' IS NULL OR ' .
                self::LAST_SALE_DATE_SQL . " <= CURRENT_DATE - INTERVAL '7 days'"
            );
        }

        $clients = $query->paginate(200);

        return response()->json([
            'data' => $clients->map(function ($c) {
                $days = $c->last_purchase_date
                    ? (int) Carbon::parse($c->last_purchase_date)->startOfDay()->diffInDays(now()->startOfDay())
                    : null;

                return array_merge(
                    $c->only(self::FIELDS),
                    [
                        'location_name'       => $c->location?->name,
                        'last_purchase_date'  => $c->last_purchase_date,
                        'days_since_purchase' => $days,
                        'last_products'       => $c->last_products,
                    ]
                );
            }),
            'meta' => [
                'current_page' => $clients->currentPage(),
                'last_page'    => $clients->lastPage(),
                'per_page'     => $clients->perPage(),
                'total'        => $clients->total(),
            ],
        ]);
    }

    public function store(StoreClientRequest $request): JsonResponse
    {
        $user = $request->user();
        $locationId = ($user->role === 'admin' && isset($request->validated()['location_id']))
            ? $request->validated()['location_id']
            : $user->location_id;

        $client = Client::create(array_merge(
            $request->validated(),
            ['location_id' => $locationId]
        ));

        $client->load('location');

        return response()->json(['data' => array_merge(
            $client->only(self::FIELDS),
            ['location_name' => $client->location?->name],
        )], 201);
    }

    public function update(UpdateClientRequest $request, Client $client): JsonResponse
    {
        $this->authorize('update', $client);
        $client->update($request->validated());

        $client->load('location');

        return response()->json(['data' => array_merge(
            $client->only(self::FIELDS),
            ['location_name' => $client->location?->name],
        )]);
    }

    public function destroy(Client $client): JsonResponse
    {
        $this->authorize('delete', $client);
        $client->delete();

        return response()->json(['message' => 'Client deleted']);
    }
}
