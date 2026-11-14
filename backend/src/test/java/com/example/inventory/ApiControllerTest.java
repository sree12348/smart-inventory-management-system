package com.example.inventory;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

class ApiControllerTest {
    private JdbcTemplate db;
    private ApiController controller;

    @BeforeEach
    void setUp() {
        db = mock(JdbcTemplate.class);
        controller = new ApiController(db);
    }

    @Test
    void healthEndpointReturnsOk() {
        assertEquals("ok", controller.health().get("status"));
        verifyNoInteractions(db);
    }

    @Test
    void createOrderRejectsMissingCustomerOrEmptyItems() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
            () -> controller.createOrder(new ApiController.NewOrder(1L, List.of())));
        assertEquals(400, ex.getStatusCode().value());
        verifyNoInteractions(db);
    }

    @Test
    void createOrderRejectsNullRequest() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
            () -> controller.createOrder(null));
        assertEquals(400, ex.getStatusCode().value());
        verifyNoInteractions(db);
    }

    @Test
    void updateOrderStatusRejectsMissingTargetStatus() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
            () -> controller.updateOrderStatus(1L, new ApiController.StatusRequest(null)));
        assertEquals(400, ex.getStatusCode().value());
        verifyNoInteractions(db);
    }

    @Test
    void updatePaymentRejectsBlankMethod() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
            () -> controller.updatePayment(3L, new ApiController.PaymentUpdate("  ", "TXN-1")));
        assertEquals(400, ex.getStatusCode().value());
        verifyNoInteractions(db);
    }

    @Test
    void updateShipmentRejectsBlankCarrier() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
            () -> controller.updateShipment(3L, new ApiController.ShipmentUpdate("TRACK-1", "  ", null)));
        assertEquals(400, ex.getStatusCode().value());
        verifyNoInteractions(db);
    }
    @Test
    void cancellingPendingOrderCancelsItsPendingShipmentAndRestoresStock() {
        when(db.queryForList(contains("SELECT id, status, total"), eq(3L)))
            .thenReturn(List.of(Map.of("id", 3L, "status", "PENDING", "total", new BigDecimal("29.99"))));
        when(db.queryForList(contains("SELECT product_id, warehouse_id, quantity"), eq(3L)))
            .thenReturn(List.of(Map.of("product_id", 2L, "warehouse_id", 1L, "quantity", 2)));

        var result = controller.updateOrderStatus(3L, new ApiController.StatusRequest("CANCELLED"));

        assertEquals("CANCELLED", result.get("status"));
        verify(db).update(
            org.mockito.ArgumentMatchers.contains("UPDATE inventory SET quantity = quantity + ?"),
            org.mockito.ArgumentMatchers.eq(2), org.mockito.ArgumentMatchers.eq(2L),
            org.mockito.ArgumentMatchers.eq(1L));
        verify(db).update(
            org.mockito.ArgumentMatchers.contains("UPDATE shipments SET status = 'CANCELLED'"),
            org.mockito.ArgumentMatchers.eq(3L));
        verify(db).update(
            org.mockito.ArgumentMatchers.eq("UPDATE payments SET status = 'CANCELLED' WHERE order_id = ?"),
            org.mockito.ArgumentMatchers.eq(3L));
    }

    @Test
    void cancellingPaidOrderMarksRefundPendingRatherThanClaimingRefundComplete() {
        when(db.queryForList(contains("SELECT id, status, total"), eq(4L)))
            .thenReturn(List.of(Map.of("id", 4L, "status", "PAID", "total", new BigDecimal("50.00"))));
        when(db.queryForList(contains("SELECT product_id, warehouse_id, quantity"), eq(4L)))
            .thenReturn(List.of());

        var result = controller.updateOrderStatus(4L, new ApiController.StatusRequest("CANCELLED"));

        assertEquals("CANCELLED", result.get("status"));
        verify(db).update(
            org.mockito.ArgumentMatchers.eq("UPDATE payments SET status = 'REFUND_PENDING' WHERE order_id = ?"),
            org.mockito.ArgumentMatchers.eq(4L));
        verify(db).update(
            org.mockito.ArgumentMatchers.contains("UPDATE shipments SET status = 'CANCELLED'"),
            org.mockito.ArgumentMatchers.eq(4L));
    }

}
