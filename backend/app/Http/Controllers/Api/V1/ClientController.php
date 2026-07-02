<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreClientRequest;
use App\Http\Requests\Api\V1\UpdateClientRequest;
use App\Models\Client;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ClientController extends Controller
{
    private const FIELDS = ['id', 'location_id', 'name', 'phone', 'notes', 'is_active'];

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Client::class);
        $query = Client::with('location')->orderBy('name');

        if ($request->filled('location_id')) {
            $query->where('location_id', $request->integer('location_id'));
        }

        if ($request->filled('search')) {
            $term = '%' . $request->string('search') . '%';
            $query->where(fn ($q) => $q->where('name', 'ilike', $term)->orWhere('phone', 'ilike', $term));
        }

        $clients = $query->paginate(200);

        return response()->json([
            'data' => $clients->map(fn ($c) => array_merge(
                $c->only(self::FIELDS),
                ['location_name' => $c->location?->name],
            )),
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
