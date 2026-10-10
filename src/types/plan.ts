export interface PlanTask {
  id: string
  name: string
  done: boolean
}

export interface PlanDay {
  id: string
  date: string
  title: string
  tasks: PlanTask[]
}

export interface CityPlan {
  city_id: string
  city_name: string
  title: string
  days: PlanDay[]
}

export interface PlansData {
  plans: CityPlan[]
}
