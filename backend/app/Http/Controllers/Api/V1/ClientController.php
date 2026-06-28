<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreClientRequest;
use App\Models\Client;
use Illuminate\Http\JsonResponse;

class ClientController extends Controller
{
    private const FIELDS = ['id', 'location_id', 'name', 'phone', 'notes', 'is_active'];

    public function index(): JsonResponse
    {
        $this->authorize('viewAny', Client::class);
        $clients = Client::orderBy('name')->paginate(50);

        return response()->json($clients->through(fn ($c) => $c->only(self::FIELDS)));
    }

    public function store(StoreClientRequest $request): JsonResponse
    {
        $client = Client::create(array_merge(
            $request->validated(),
            ['location_id' => $request->user()->location_id]
        ));

        return response()->json(['data' => $client->only(self::FIELDS)], 201);
    }
}
