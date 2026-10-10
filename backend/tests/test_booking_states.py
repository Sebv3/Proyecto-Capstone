import pytest

from app.schemas.booking import BookingStatus as S
from app.schemas.catalog import ServiceModality as M
from app.services.booking_states import BookingActor as A
from app.services.booking_states import transition_booking

VALID_TRANSITIONS = [
    (modality, start, end, actor)
    for modality in M
    for start, end, actor in [
        (S.PENDIENTE, S.ACEPTADA, A.TRABAJADOR),
        (S.PENDIENTE, S.RECHAZADA, A.TRABAJADOR),
        (S.ACEPTADA, S.PAGADA, A.PAGO),
    ]
] + [
    (M.DOMICILIO, S.PAGADA, S.EN_CAMINO, A.TRABAJADOR),
    (M.DOMICILIO, S.EN_CAMINO, S.EN_CURSO, A.TRABAJADOR),
    (M.DOMICILIO, S.EN_CURSO, S.COMPLETADA, A.CONFIRMACION),
    (M.TALLER, S.PAGADA, S.EN_CURSO, A.TRABAJADOR),
    (M.TALLER, S.EN_CURSO, S.LISTO, A.TRABAJADOR),
    (M.TALLER, S.LISTO, S.COMPLETADA, A.CONFIRMACION),
]


@pytest.mark.parametrize(("modality", "start", "end", "actor"), VALID_TRANSITIONS)
def test_accepts_business_flow(modality, start, end, actor):
    assert transition_booking(start, end, modality, actor) == end


@pytest.mark.parametrize(("modality", "start", "end", "actor"), [
    (modality, start, end, other)
    for modality, start, end, owner in VALID_TRANSITIONS
    for other in A if other != owner
])
def test_rejects_wrong_actor_for_each_transition(modality, start, end, actor):
    with pytest.raises(ValueError):
        transition_booking(start, end, modality, actor)


@pytest.mark.parametrize("modality", list(M))
@pytest.mark.parametrize("terminal", [S.COMPLETADA, S.RECHAZADA, S.CANCELADA])
@pytest.mark.parametrize("target", list(S))
def test_terminal_states_cannot_be_reopened(modality, terminal, target):
    with pytest.raises(ValueError):
        transition_booking(terminal, target, modality, A.TRABAJADOR)


@pytest.mark.parametrize("modality", list(M))
@pytest.mark.parametrize("actor", [A.CLIENTE, A.TRABAJADOR])
@pytest.mark.parametrize("start", [S.PENDIENTE, S.ACEPTADA])
def test_participants_can_cancel_before_payment_with_a_reason(modality, actor, start):
    assert transition_booking(start, S.CANCELADA, modality, actor,
                              cancellation_reason="Cambio de planes") == S.CANCELADA


@pytest.mark.parametrize("reason", [None, "", "  ", "ab", "x" * 501])
def test_cancellation_requires_a_valid_reason(reason):
    with pytest.raises(ValueError):
        transition_booking(S.PENDIENTE, S.CANCELADA, M.DOMICILIO, A.CLIENTE,
                           cancellation_reason=reason)


@pytest.mark.parametrize("modality", list(M))
@pytest.mark.parametrize("actor", list(A))
def test_paid_cancellation_waits_for_refund_workflow(modality, actor):
    with pytest.raises(ValueError):
        transition_booking(S.PAGADA, S.CANCELADA, modality, actor,
                           cancellation_reason="Cambio de planes")


@pytest.mark.parametrize(("modality", "start", "end"), [
    (M.DOMICILIO, S.PAGADA, S.EN_CURSO),
    (M.DOMICILIO, S.EN_CURSO, S.LISTO),
    (M.TALLER, S.PAGADA, S.EN_CAMINO),
    (M.TALLER, S.EN_CURSO, S.COMPLETADA),
    (M.TALLER, S.LISTO, S.EN_CURSO),
    (M.DOMICILIO, S.PENDIENTE, S.COMPLETADA),
])
def test_cannot_skip_or_reverse_steps_or_mix_modalities(modality, start, end):
    with pytest.raises(ValueError):
        transition_booking(start, end, modality, A.TRABAJADOR)


def test_reason_is_not_accepted_for_other_operations():
    with pytest.raises(ValueError):
        transition_booking(S.PENDIENTE, S.ACEPTADA, M.TALLER, A.TRABAJADOR,
                           cancellation_reason="Cambio de planes")


@pytest.mark.parametrize("actor", [A.PAGO, A.CONFIRMACION])
def test_system_processes_cannot_cancel_as_participants(actor):
    with pytest.raises(ValueError):
        transition_booking(S.PENDIENTE, S.CANCELADA, M.TALLER, actor,
                           cancellation_reason="Cambio de planes")


@pytest.mark.parametrize("state", [S.PENDIENTE, S.ACEPTADA, S.PAGADA, S.EN_CURSO])
def test_repeated_state_changes_are_rejected(state):
    with pytest.raises(ValueError):
        transition_booking(state, state, M.DOMICILIO, A.TRABAJADOR)


@pytest.mark.parametrize("modality", list(M))
@pytest.mark.parametrize("actor", list(A))
def test_entire_transition_matrix_has_no_unlisted_paths(modality, actor):
    permitted = {(start, end) for mode, start, end, owner in VALID_TRANSITIONS
                 if mode == modality and owner == actor}
    if actor in (A.CLIENTE, A.TRABAJADOR):
        permitted.update({(S.PENDIENTE, S.CANCELADA), (S.ACEPTADA, S.CANCELADA)})
    for start in S:
        for end in S:
            reason = "Cambio de planes" if end == S.CANCELADA else None
            if (start, end) in permitted:
                assert transition_booking(start, end, modality, actor,
                                          cancellation_reason=reason) == end
            else:
                with pytest.raises(ValueError):
                    transition_booking(start, end, modality, actor, cancellation_reason=reason)


@pytest.mark.parametrize("field", ["current", "target", "modality", "actor"])
def test_unrecognized_state_modality_or_actor_is_never_accepted(field):
    values = {"current": S.PENDIENTE, "target": S.ACEPTADA,
              "modality": M.DOMICILIO, "actor": A.TRABAJADOR}
    values[field] = "INVALID"
    with pytest.raises(ValueError):
        transition_booking(**values)


@pytest.mark.parametrize("reason", ["abc", "x" * 500])
def test_cancellation_accepts_both_reason_length_boundaries(reason):
    assert transition_booking(S.ACEPTADA, S.CANCELADA, M.TALLER, A.CLIENTE,
                              cancellation_reason=reason) == S.CANCELADA
